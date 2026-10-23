import { Request, Response } from "express";

import {
  supabaseAdmin,
  STORAGE_BUCKET,
} from "../config/supabase";

import {
  checkDocumentAccess,
} from "../permissions/permission.service";

import { pool } from "../config/database";

import type {
  AuthenticatedRequest,
} from "../middleware/auth.middleware";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getDocumentId(req: Request): string | null {
  const id = req.params.id;

  if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
    return null;
  }

  return id;
}

export async function downloadDocument(
  req: Request,
  res: Response
) {
  const authReq = req as AuthenticatedRequest;

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

  try {
    /*
     * CRITICAL SECURITY CHECK
     *
     * This queries the current database permission.
     *
     * We do NOT trust:
     * - the frontend
     * - the JWT role
     * - a previously issued permission
     * - knowledge of the document ID
     */
    const access = await checkDocumentAccess({
      documentId,
      userId: authReq.user.sub,
      requiredPermission: "read",
    });

    /*
     * No access.
     *
     * We intentionally record the refusal before returning 403.
     */
    if (!access.allowed) {
      await pool.query(
        `
        INSERT INTO audit_logs
          (
            user_id,
            document_id,
            action,
            success,
            ip_address,
            user_agent,
            details
          )
        VALUES
          (
            $1,
            $2,
            'access_denied',
            false,
            $3,
            $4,
            $5
          )
        `,
        [
          authReq.user.sub,
          documentId,
          req.ip || null,
          req.get("user-agent") || null,
          JSON.stringify({
            operation: "download",
            reason: access.reason,
          }),
        ]
      );

      return res.status(403).json({
        error: "ACCESS_DENIED",
      });
    }

    const document = access.document;

    if (!document) {
      return res.status(404).json({
        error: "DOCUMENT_NOT_FOUND",
      });
    }

    /*
     * Only now do we touch private Storage.
     */
    const { data, error } =
      await supabaseAdmin.storage
        .from(STORAGE_BUCKET)
        .download(document.storage_path);

    if (error || !data) {
      console.error(
        "Storage download failed:",
        error?.message
      );

      return res.status(404).json({
        error: "FILE_NOT_FOUND",
      });
    }

    /*
     * Audit successful download.
     */
    await pool.query(
      `
      INSERT INTO audit_logs
        (
          user_id,
          document_id,
          action,
          success,
          ip_address,
          user_agent,
          details
        )
      VALUES
        (
          $1,
          $2,
          'download',
          true,
          $3,
          $4,
          $5
        )
      `,
      [
        authReq.user.sub,
        documentId,
        req.ip || null,
        req.get("user-agent") || null,
        JSON.stringify({
          filename: document.original_filename,
          permissionReason: access.reason,
        }),
      ]
    );

    /*
     * Convert the downloaded Blob into a Buffer
     * so Express can stream it to the authorized user.
     */
    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader(
      "Content-Type",
      document.mime_type || "application/octet-stream"
    );

    res.setHeader(
      "Content-Length",
      buffer.length
    );

    const originalFilename = String(
      document.original_filename ?? "download"
    )
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .replace(/[\\/]/g, "_")
      .trim() || "download";

    const asciiFallback = originalFilename
      .replace(/[^\x20-\x7E]/g, "_")
      .replace(/["\\]/g, "_")
      .replace(/[\/:]/g, "_") || "download";

    const encodedFilename = encodeURIComponent(originalFilename).replace(
      /['()*]/g,
      (character) =>
        `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedFilename}`
    );

    return res.send(buffer);

  } catch (error) {
    console.error(
      "Document download error:",
      error
    );

    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
    });
  }
}
