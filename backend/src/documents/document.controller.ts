import * as yauzl from "yauzl";
import { Request, Response } from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import { z } from "zod";

import { createDocument, listDocumentsForUser } from "./document.service";
import { pool } from "../config/database";
import type { PoolClient } from "pg";
import {
  supabaseAdmin,
  STORAGE_BUCKET,
} from "../config/supabase";

import type { AuthenticatedRequest } from "../middleware/auth.middleware";

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 10 * 1024 * 1024,
  },

  fileFilter: (_req, file, callback) => {
    const allowedTypes = new Set([
      "application/pdf",
      "text/plain",
      "image/png",
      "image/jpeg",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]);

    if (!allowedTypes.has(file.mimetype)) {
      return callback(new Error("UNSUPPORTED_FILE_TYPE"));
    }

    callback(null, true);
  },
});

const metadataSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
  category: z.string().trim().max(100).optional(),
});


async function isValidUploadedFile(buffer: Buffer, mimeType: string): Promise<boolean> {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return false;

  switch (mimeType) {
    case "application/pdf":
      return buffer.subarray(0, 5).toString("ascii") === "%PDF-";

    case "image/png":
      return buffer.length >= 8 &&
        buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

    case "image/jpeg":
      return buffer.length >= 3 &&
        buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

    case "text/plain":
      if (buffer.includes(0)) return false;
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(buffer);
        return true;
      } catch {
        return false;
      }

    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return new Promise<boolean>((resolve) => {
        yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
          if (error || !zip) return resolve(false);

          let hasContentTypes = false;
          let hasDocument = false;
          let settled = false;

          const finish = (valid: boolean) => {
            if (settled) return;
            settled = true;
            resolve(valid);
            zip.close();
          };

          zip.on("error", () => finish(false));
          zip.on("entry", (entry) => {
            if (entry.fileName === "[Content_Types].xml") hasContentTypes = true;
            if (entry.fileName === "word/document.xml") hasDocument = true;
            zip.readEntry();
          });
          zip.on("end", () => finish(hasContentTypes && hasDocument));
          zip.readEntry();
        });
      });

    default:
      return false;
  }
}
export const uploadMiddleware = upload.single("file");

export async function uploadDocument(
  req: Request,
  res: Response
) {
  const authReq = req as AuthenticatedRequest;

  let uploadedStoragePath: string | null = null;
  let storageUploadSucceeded = false;
  let transactionStarted = false;
  let transactionCommitted = false;
  let commitAttempted = false;
  let transactionOutcomeUncertain = false;
  let dbClient: PoolClient | null = null;

  try {
    /*
     * Authentication must already have happened.
     */
    if (!authReq.user?.sub) {
      return res.status(401).json({
        error: "UNAUTHORIZED",
      });
    }

    /*
     * A real file is required.
     */
    if (!req.file) {
      return res.status(400).json({
        error: "FILE_REQUIRED",
      });
    }

    if (!(await isValidUploadedFile(req.file.buffer, req.file.mimetype))) {
      return res.status(400).json({ error: "INVALID_FILE_CONTENT" });
    }

    /*
     * Validate document metadata.
     */
    const parsed = metadataSchema.safeParse({
      name: req.body.name,
      description: req.body.description,
      category: req.body.category,
    });

    if (!parsed.success) {
      return res.status(400).json({
        error: "INVALID_METADATA",
        details: parsed.error.flatten(),
      });
    }

    /*
     * Generate an unpredictable storage path.
     *
     * We never use the original filename as the storage path.
     */
    const extension = path.extname(req.file.originalname);

    const randomName = crypto
      .randomBytes(32)
      .toString("hex");

    const storagePath =
      `${authReq.user.sub}/${randomName}${extension}`;

    uploadedStoragePath = storagePath;

    /*
     * Upload the actual file bytes to the PRIVATE bucket.
     *
     * No public URL is generated.
     */
    const { error: storageError } =
      await supabaseAdmin.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, req.file.buffer, {
          contentType: req.file.mimetype,
          cacheControl: "3600",
          upsert: false,
        });

    if (storageError) {
      console.error(
        "Supabase Storage upload failed:",
        storageError.message
      );

      return res.status(500).json({
        error: "STORAGE_UPLOAD_FAILED",
      });
    }

    storageUploadSucceeded = true;

    /*
     * Store metadata and its audit record in one PostgreSQL
     * transaction so they either both commit or both roll back.
     */
    dbClient = await pool.connect();
    transactionStarted = true;
    await dbClient.query("BEGIN");

    const document = await createDocument({
      ownerId: authReq.user.sub,
      name: parsed.data.name,
      description: parsed.data.description,
      category: parsed.data.category,
      storagePath,
      originalFilename: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
    }, dbClient);

    await dbClient.query(
      `
      INSERT INTO audit_logs
        (user_id, document_id, action, success, details)
      VALUES
        ($1, $2, 'upload', true, $3)
      `,
      [
        authReq.user.sub,
        document.id,
        JSON.stringify({
          filename: req.file.originalname,
          mimeType: req.file.mimetype,
          fileSize: req.file.size,
          storagePath,
        }),
      ]
    );

    commitAttempted = true;
    await dbClient.query("COMMIT");
    transactionCommitted = true;

    return res.status(201).json({
      message: "Document uploaded successfully",
      document,
    });

  } catch (error) {
    console.error(
      "Document upload error:",
      error
    );

    /*
     * Roll back metadata and audit changes before cleaning up Storage.
     */
    if (dbClient && transactionStarted && !transactionCommitted) {
      try {
        await dbClient.query("ROLLBACK");
      } catch (rollbackError) {
        transactionOutcomeUncertain = true;
        console.error("Upload transaction rollback failed:", rollbackError);
      }
    }

    /*
     * Remove Storage only when the upload was confirmed successful
     * and the database transaction did not commit.
     */
    if (
      uploadedStoragePath &&
      storageUploadSucceeded &&
      !transactionCommitted &&
      !commitAttempted &&
      !transactionOutcomeUncertain
    ) {
      try {
        const { error: cleanupError } =
          await supabaseAdmin.storage
            .from(STORAGE_BUCKET)
            .remove([uploadedStoragePath]);

        if (cleanupError) {
          console.error(
            "Storage cleanup failed:",
            cleanupError.message
          );
        }
      } catch (cleanupError) {
        console.error("Storage cleanup threw an error:", cleanupError);
      }
    }

    if (
      error instanceof Error &&
      error.message === "UNSUPPORTED_FILE_TYPE"
    ) {
      return res.status(400).json({
        error: "UNSUPPORTED_FILE_TYPE",
      });
    }

    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
    });
  } finally {
    dbClient?.release();
  }
}

export async function listDocuments(
  req: Request,
  res: Response
) {
  const authReq = req as AuthenticatedRequest;

  if (!authReq.user?.sub) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }

  try {
    const documents = await listDocumentsForUser(authReq.user.sub);

    return res.json({ documents });
  } catch (error) {
    console.error("Document list error:", error);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
    });
  }
}


export async function deleteDocument(req: Request, res: Response) {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user?.sub;
  const documentId = String(req.params.id);

  if (!userId) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(documentId)) {
    return res.status(400).json({ error: "INVALID_DOCUMENT_ID" });
  }

  let client: PoolClient | undefined;
  let transactionStarted = false;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    const found = await client.query(
      `SELECT id, owner_id, is_deleted
       FROM documents
       WHERE id = $1
       FOR UPDATE`,
      [documentId]
    );

    if (found.rowCount !== 1) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({
        error: "DOCUMENT_NOT_FOUND_OR_NOT_OWNER"
      });
    }

    const document = found.rows[0];

    if (document.owner_id !== userId) {
      await client.query(
        `INSERT INTO audit_logs
           (user_id, document_id, action, success, details)
         VALUES ($1, $2, 'delete', false, $3)`,
        [
          userId,
          documentId,
          JSON.stringify({ reason: "NOT_DOCUMENT_OWNER" })
        ]
      );

      await client.query("COMMIT");
      transactionStarted = false;

      return res.status(404).json({
        error: "DOCUMENT_NOT_FOUND_OR_NOT_OWNER"
      });
    }

    if (document.is_deleted) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({
        error: "DOCUMENT_NOT_FOUND_OR_NOT_OWNER"
      });
    }

    await client.query(
      `UPDATE documents
       SET is_deleted = true
       WHERE id = $1 AND owner_id = $2 AND is_deleted = false`,
      [documentId, userId]
    );

    await client.query(
      `INSERT INTO audit_logs
         (user_id, document_id, action, success, details)
       VALUES ($1, $2, 'delete', true, $3)`,
      [
        userId,
        documentId,
        JSON.stringify({ result: "SOFT_DELETE" })
      ]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return res.json({ message: "Document deleted successfully." });
  } catch (error) {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Document delete rollback error:", rollbackError);
      }
    }

    console.error("Document delete error:", error);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  } finally {
    client?.release();
  }
}