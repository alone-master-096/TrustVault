import { pool } from "../config/database";
import type { PoolClient } from "pg";

export async function createDocument(input: {
  ownerId: string;
  name: string;
  description?: string;
  category?: string;
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
}, client: PoolClient) {
  const result = await client.query(
    `
    INSERT INTO documents (
      owner_id,
      name,
      description,
      category,
      storage_path,
      original_filename,
      mime_type,
      file_size
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
    `,
    [
      input.ownerId,
      input.name,
      input.description ?? null,
      input.category ?? null,
      input.storagePath,
      input.originalFilename,
      input.mimeType,
      input.fileSize,
    ]
  );

  return result.rows[0];
}

export async function getDocumentForOwner(
  documentId: string,
  ownerId: string
) {
  const result = await pool.query(
    `
    SELECT *
    FROM documents
    WHERE id = $1
      AND owner_id = $2
      AND is_deleted = false
    `,
    [documentId, ownerId]
  );

  return result.rows[0] ?? null;
}

export async function getDocumentById(
  documentId: string
) {
  const result = await pool.query(
    `
    SELECT *
    FROM documents
    WHERE id = $1
      AND is_deleted = false
    `,
    [documentId]
  );

  return result.rows[0] ?? null;
}


export async function listDocumentsForUser(userId: string) {
  const result = await pool.query(
    `
    SELECT
      d.id,
      d.owner_id,
      d.name,
      d.description,
      d.category,
      d.original_filename,
      d.mime_type,
      d.file_size,
      CASE
        WHEN d.owner_id = $1 THEN 'owner'::text
        ELSE dp.permission::text
      END AS access_permission,
      (d.owner_id = $1) AS is_owner
    FROM documents d
    LEFT JOIN document_permissions dp
      ON dp.document_id = d.id
      AND dp.user_id = $1
      AND dp.is_active = true
    WHERE d.is_deleted = false
      AND (
        d.owner_id = $1
        OR dp.permission IN ('read', 'edit')
      )
    ORDER BY d.id DESC
    `,
    [userId]
  );

  return result.rows;
}

