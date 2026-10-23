import type { AuthenticatedRequest } from "./auth.middleware";
import type { Response, NextFunction } from "express";

type Role = "admin" | "owner" | "viewer";

export function requireRoles(...allowedRoles: Role[]) {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.user) {
      return res.status(401).json({
        error: "AUTHENTICATION_REQUIRED",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: "FORBIDDEN",
        message: "You do not have permission to perform this action",
      });
    }

    next();
  };
}
