import { createHash, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { pool } from "../config/database";

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const SALT_ROUNDS = 12;

function hashCode(email: string, code: string): string {
  return createHash("sha256")
    .update(`${email.toLowerCase()}:${code}:${process.env.JWT_SECRET}`)
    .digest("hex");
}

async function ensureResetTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_codes (
      email VARCHAR(255) PRIMARY KEY,
      code_hash CHAR(64) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function requestPasswordReset(rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
  const from = process.env.EMAIL_FROM || gmailUser;

  if (!gmailUser || !gmailAppPassword || !from) {
    throw new Error("EMAIL_PROVIDER_NOT_CONFIGURED");
  }

  await ensureResetTable();

  const account = await pool.query(
    "SELECT id FROM users WHERE email = $1 AND is_active = true",
    [email]
  );

  if (account.rowCount === 0) return;

  const recent = await pool.query(
    "SELECT created_at FROM password_reset_codes WHERE email = $1",
    [email]
  );

  if (
    recent.rowCount &&
    Date.now() - new Date(recent.rows[0].created_at).getTime() < 60_000
  ) {
    throw new Error("RESET_RATE_LIMITED");
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000);

  await pool.query(
    `INSERT INTO password_reset_codes (email, code_hash, expires_at, attempts, created_at)
     VALUES ($1, $2, $3, 0, NOW())
     ON CONFLICT (email) DO UPDATE SET
       code_hash = EXCLUDED.code_hash,
       expires_at = EXCLUDED.expires_at,
       attempts = 0,
       created_at = NOW()`,
    [email, hashCode(email, code), expiresAt]
  );

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: gmailUser,
        pass: gmailAppPassword.replace(/\s/g, ""),
      },
    });

    await transporter.sendMail({
      from,
      to: email,
      subject: "Your TrustVault password reset code",
      text: `Your TrustVault verification code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes. If you did not request this, ignore this email.`,
    });
  } catch {
    await pool.query(
      "DELETE FROM password_reset_codes WHERE email = $1",
      [email]
    );
    throw new Error("EMAIL_DELIVERY_FAILED");
  }
}

export async function resetPassword(
  rawEmail: string,
  rawCode: string,
  newPassword: string
): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  const code = rawCode.trim();

  if (!/^\d{6}$/.test(code)) throw new Error("INVALID_RESET_CODE");
  if (newPassword.length < 8 || newPassword.length > 100) {
    throw new Error("INVALID_NEW_PASSWORD");
  }

  await ensureResetTable();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      `SELECT code_hash, expires_at, attempts
       FROM password_reset_codes WHERE email = $1 FOR UPDATE`,
      [email]
    );

    if (result.rowCount === 0) throw new Error("INVALID_RESET_CODE");

    const record = result.rows[0];
    if (
      new Date(record.expires_at).getTime() <= Date.now() ||
      Number(record.attempts) >= MAX_ATTEMPTS
    ) {
      await client.query(
        "DELETE FROM password_reset_codes WHERE email = $1",
        [email]
      );
      await client.query("COMMIT");
      throw new Error("INVALID_RESET_CODE");
    }

    const suppliedHash = hashCode(email, code);
    if (suppliedHash !== record.code_hash) {
      await client.query(
        "UPDATE password_reset_codes SET attempts = attempts + 1 WHERE email = $1",
        [email]
      );
      await client.query("COMMIT");
      throw new Error("INVALID_RESET_CODE");
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const updated = await client.query(
      "UPDATE users SET password_hash = $1 WHERE email = $2 AND is_active = true",
      [passwordHash, email]
    );

    if (updated.rowCount !== 1) throw new Error("INVALID_RESET_CODE");

    await client.query(
      "DELETE FROM password_reset_codes WHERE email = $1",
      [email]
    );
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}
