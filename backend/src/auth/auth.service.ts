import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../config/database";
import type { RegisterInput, LoginInput } from "./auth.types";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not configured");
}

const JWT_SECRET_VALUE: string = JWT_SECRET;

const SALT_ROUNDS = 12;

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "owner" | "viewer";
  is_active: boolean;
}

export async function registerUser(
  input: RegisterInput
): Promise<AuthUser> {
  const email = input.email.toLowerCase();

  const existing = await pool.query(
    "SELECT id FROM users WHERE email = $1",
    [email]
  );

  if (existing.rowCount && existing.rowCount > 0) {
    throw new Error("EMAIL_ALREADY_EXISTS");
  }

  const passwordHash = await bcrypt.hash(
    input.password,
    SALT_ROUNDS
  );

  const result = await pool.query(
    `
    INSERT INTO users (name, email, password_hash, role)
    VALUES ($1, $2, $3, $4)
    RETURNING id, name, email, role, is_active
    `,
    [input.name, email, passwordHash, "viewer"]
  );

  return result.rows[0] as AuthUser;
}

export async function loginUser(input: LoginInput) {
  const email = input.email.toLowerCase();

  const result = await pool.query(
    `
    SELECT id, name, email, password_hash, role, is_active
    FROM users
    WHERE email = $1
    `,
    [email]
  );

  if (result.rowCount === 0) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const user = result.rows[0];

  if (!user.is_active) {
    throw new Error("ACCOUNT_DISABLED");
  }

  const passwordValid = await bcrypt.compare(
    input.password,
    user.password_hash
  );

  if (!passwordValid) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const token = jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email,
    },
    JWT_SECRET_VALUE,
    {
      expiresIn: "2h",
    }
  );

  await pool.query(
    `
    INSERT INTO audit_logs
      (user_id, action, success, details)
    VALUES
      ($1, 'login', true, $2)
    `,
    [
      user.id,
      JSON.stringify({
        method: "password",
      }),
    ]
  );

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      is_active: user.is_active,
    } as AuthUser,
  };
}

