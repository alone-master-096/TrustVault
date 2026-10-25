import type { Request, Response } from "express";
import { z } from "zod";
import { registerSchema, loginSchema } from "./auth.types";
import { registerUser, loginUser } from "./auth.service";
import { requestPasswordReset, resetPassword } from "./password-reset.service";

const resetRequestSchema = z.object({
  email: z.string().trim().email().max(255),
});
const resetPasswordSchema = z.object({
  email: z.string().trim().email().max(255),
  code: z.string().trim().regex(/^\d{6}$/),
  newPassword: z.string().min(8).max(100),
});

export async function requestReset(req: Request, res: Response) {
  const parsed = resetRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "Enter a valid email address." });
  }

  try {
    await requestPasswordReset(parsed.data.email);
    return res.status(200).json({
      message: "If an active account exists for that email, a verification code will be sent.",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "RESET_RATE_LIMITED") {
      return res.status(429).json({ error: "RESET_RATE_LIMITED", message: "Please wait one minute before requesting another code." });
    }
    if (error instanceof Error && error.message === "EMAIL_PROVIDER_NOT_CONFIGURED") {
      return res.status(503).json({ error: "EMAIL_PROVIDER_NOT_CONFIGURED", message: "Password reset email is not configured yet. Please try again later." });
    }
    console.error("[PasswordReset] Request error:", error instanceof Error ? error.message : "Unknown error");
    return res.status(502).json({ error: "EMAIL_DELIVERY_FAILED", message: "Unable to send the verification email right now. Please try again later." });
  }
}

export async function completeReset(req: Request, res: Response) {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "Enter a valid email, six-digit code, and password of at least 8 characters." });
  }

  try {
    await resetPassword(parsed.data.email, parsed.data.code, parsed.data.newPassword);
    return res.status(200).json({ message: "Password reset successfully. Sign in with your original email and new password." });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_NEW_PASSWORD") {
      return res.status(400).json({ error: "INVALID_NEW_PASSWORD", message: "Password must be between 8 and 100 characters." });
    }
    return res.status(400).json({ error: "INVALID_RESET_CODE", message: "The code is invalid or expired. Request a new code and try again." });
  }
}

export async function register(req: Request, res: Response) {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
    }
    const user = await registerUser(parsed.data);
    return res.status(201).json({ message: "User registered successfully", user });
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_ALREADY_EXISTS") {
      return res.status(409).json({ error: "EMAIL_ALREADY_EXISTS", message: "A user with this email already exists" });
    }
    console.error("Register error:", error);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
    }
    const result = await loginUser(parsed.data);
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_CREDENTIALS") {
      return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Invalid email or password" });
    }
    if (error instanceof Error && error.message === "ACCOUNT_DISABLED") {
      return res.status(403).json({ error: "ACCOUNT_DISABLED", message: "This account is disabled" });
    }
    console.error("Login error:", error);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}
