import { Request, Response } from "express";
import { z } from "zod";

import {
  grantPermission,
  revokePermission,
} from "./permission.service";

import type { AuthenticatedRequest } from "../middleware/auth.middleware";

const grantSchema = z.object({
  userId: z.string().uuid(),
  permission: z.enum(["read", "edit"]),
});

const revokeSchema = z.object({
  userId: z.string().uuid(),
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getDocumentId(req: Request): string | null {
  const id = req.params.id;

  if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
    return null;
  }

  return id;
}

export async function grantDocumentPermission(
  req: Request,
  res: Response
) {
  const authReq = req as AuthenticatedRequest;

  try {
    if (!authReq.user?.sub) {
      return res.status(401).json({
        error: "UNAUTHORIZED",
      });
    }

    const documentId = getDocumentId(req);

    if (!documentId) {
      return res.status(400).json({
        error: "INVALID_DOCUMENT_ID",
      });
    }

    const parsed = grantSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "INVALID_REQUEST",
        details: parsed.error.flatten(),
      });
    }

    const permission = await grantPermission({
      documentId,
      userId: parsed.data.userId,
      permission: parsed.data.permission,
      grantedBy: authReq.user.sub,
    });

    return res.status(201).json({
      message: "Permission granted",
      permission,
    });
  } catch (error) {
    if (!(error instanceof Error)) {
      return res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
      });
    }

    const statusMap: Record<string, number> = {
      DOCUMENT_NOT_FOUND: 404,
      NOT_DOCUMENT_OWNER: 403,
      CANNOT_GRANT_TO_OWNER: 400,
      USER_NOT_FOUND: 404,
      USER_INACTIVE: 400,
    };

    const status = statusMap[error.message] ?? 500;

    return res.status(status).json({
      error:
        status === 500
          ? "INTERNAL_SERVER_ERROR"
          : error.message,
    });
  }
}

export async function revokeDocumentPermission(
  req: Request,
  res: Response
) {
  const authReq = req as AuthenticatedRequest;

  try {
    if (!authReq.user?.sub) {
      return res.status(401).json({
        error: "UNAUTHORIZED",
      });
    }

    const documentId = getDocumentId(req);

    if (!documentId) {
      return res.status(400).json({
        error: "INVALID_DOCUMENT_ID",
      });
    }

    const parsed = revokeSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "INVALID_REQUEST",
        details: parsed.error.flatten(),
      });
    }

    await revokePermission({
      documentId,
      userId: parsed.data.userId,
      revokedBy: authReq.user.sub,
    });

    return res.json({
      message: "Permission revoked",
    });
  } catch (error) {
    if (!(error instanceof Error)) {
      return res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
      });
    }

    const statusMap: Record<string, number> = {
      DOCUMENT_NOT_FOUND: 404,
      NOT_DOCUMENT_OWNER: 403,
      PERMISSION_NOT_FOUND: 404,
    };

    const status = statusMap[error.message] ?? 500;

    return res.status(status).json({
      error:
        status === 500
          ? "INTERNAL_SERVER_ERROR"
          : error.message,
    });
  }
}
