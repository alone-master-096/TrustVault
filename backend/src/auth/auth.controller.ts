import type { Request, Response } from "express";
import {
  registerSchema,
  loginSchema,
} from "./auth.types";
import {
  registerUser,
  loginUser,
} from "./auth.service";

export async function register(req: Request, res: Response) {
  try {
    const parsed = registerSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        details: parsed.error.flatten(),
      });
    }

    const user = await registerUser(parsed.data);

    return res.status(201).json({
      message: "User registered successfully",
      user,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_ALREADY_EXISTS") {
      return res.status(409).json({
        error: "EMAIL_ALREADY_EXISTS",
        message: "A user with this email already exists",
      });
    }

    console.error("Register error:", error);

    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
    });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        details: parsed.error.flatten(),
      });
    }

    const result = await loginUser(parsed.data);

    return res.status(200).json(result);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "INVALID_CREDENTIALS"
    ) {
      return res.status(401).json({
        error: "INVALID_CREDENTIALS",
        message: "Invalid email or password",
      });
    }

    if (
      error instanceof Error &&
      error.message === "ACCOUNT_DISABLED"
    ) {
      return res.status(403).json({
        error: "ACCOUNT_DISABLED",
        message: "This account is disabled",
      });
    }

    console.error("Login error:", error);

    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
    });
  }
}
