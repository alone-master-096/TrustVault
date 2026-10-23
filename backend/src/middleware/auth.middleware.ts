import type { Request, Response, NextFunction } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { pool } from "../config/database";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not configured");
}

const JWT_SECRET_VALUE: string = JWT_SECRET;
const VALID_ROLES = ["admin", "owner", "viewer"] as const;

type UserRole = (typeof VALID_ROLES)[number];

export interface AuthPayload extends JwtPayload {
  sub: string;
  role: UserRole;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthPayload;
}

function isUserRole(value: unknown): value is UserRole {
  return (
    typeof value === "string" &&
    VALID_ROLES.some((role) => role === value)
  );
}

export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }

  const token = authorization.slice("Bearer ".length).trim();

  if (!token) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }

  let decoded: string | JwtPayload;

  try {
    decoded = jwt.verify(token, JWT_SECRET_VALUE, {
      algorithms: ["HS256"],
    });
  } catch {
    return res.status(401).json({ error: "INVALID_TOKEN" });
  }

  if (
    typeof decoded !== "object" ||
    decoded === null ||
    typeof decoded.sub !== "string" ||
    typeof decoded.email !== "string" ||
    !isUserRole(decoded.role)
  ) {
    return res.status(401).json({ error: "INVALID_TOKEN" });
  }

  try {
    const result = await pool.query(
      `
      SELECT id, email, role, is_active
      FROM users
      WHERE id = $1
      `,
      [decoded.sub]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "INVALID_TOKEN" });
    }

    const currentUser = result.rows[0];

    if (!currentUser.is_active) {
      return res.status(403).json({ error: "ACCOUNT_DISABLED" });
    }

    if (
      typeof currentUser.email !== "string" ||
      !isUserRole(currentUser.role)
    ) {
      console.error("Authentication rejected: invalid user record");
      return res.status(403).json({ error: "ACCOUNT_INVALID" });
    }

    // Use current database identity and role, not stale JWT claims.
    req.user = {
      ...decoded,
      sub: String(currentUser.id),
      email: currentUser.email,
      role: currentUser.role,
    } as AuthPayload;

    return next();
  } catch (error) {
    console.error("Authentication database check failed:", error);
    return res.status(503).json({
      error: "AUTHENTICATION_SERVICE_UNAVAILABLE",
    });
  }
}