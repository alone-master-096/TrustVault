import { pool } from "../config/database";

export type PermissionType = "read" | "edit";

export async function grantPermission(input: {
  documentId: string;
  userId: string;
  permission: PermissionType;
  grantedBy: string;
}) {
  const client = await pool.connect();
  let transactionStarted = false;
  let transactionCommitted = false;
  let commitAttempted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    const document = await client.query(
      `
      SELECT id, owner_id
      FROM documents
      WHERE id = $1
        AND is_deleted = false
      `,
      [input.documentId]
    );

    if (document.rowCount === 0) {
      throw new Error("DOCUMENT_NOT_FOUND");
    }

    if (document.rows[0].owner_id !== input.grantedBy) {
      throw new Error("NOT_DOCUMENT_OWNER");
    }

    if (input.userId === input.grantedBy) {
      throw new Error("CANNOT_GRANT_TO_OWNER");
    }

    const user = await client.query(
      `
      SELECT id, is_active
      FROM users
      WHERE id = $1
      `,
      [input.userId]
    );

    if (user.rowCount === 0) {
      throw new Error("USER_NOT_FOUND");
    }

    if (!user.rows[0].is_active) {
      throw new Error("USER_INACTIVE");
    }

    const existing = await client.query(
      `
      SELECT id
      FROM document_permissions
      WHERE document_id = $1
        AND user_id = $2
      `,
      [input.documentId, input.userId]
    );

    let result;

    if (existing.rowCount && existing.rowCount > 0) {
      result = await client.query(
        `
        UPDATE document_permissions
        SET
          permission = $1,
          is_active = true,
          granted_by = $2,
          granted_at = NOW(),
          revoked_at = NULL
        WHERE document_id = $3
          AND user_id = $4
        RETURNING *
        `,
        [
          input.permission,
          input.grantedBy,
          input.documentId,
          input.userId,
        ]
      );

      await client.query(
        `
        INSERT INTO audit_logs
          (user_id, document_id, action, success, details)
        VALUES
          ($1, $2, 'permission_changed', true, $3)
        `,
        [
          input.grantedBy,
          input.documentId,
          JSON.stringify({
            targetUserId: input.userId,
            permission: input.permission,
          }),
        ]
      );
    } else {
      result = await client.query(
        `
        INSERT INTO document_permissions
          (
            document_id,
            user_id,
            permission,
            granted_by,
            is_active
          )
        VALUES
          ($1, $2, $3, $4, true)
        RETURNING *
        `,
        [
          input.documentId,
          input.userId,
          input.permission,
          input.grantedBy,
        ]
      );

      await client.query(
        `
        INSERT INTO audit_logs
          (user_id, document_id, action, success, details)
        VALUES
          ($1, $2, 'permission_granted', true, $3)
        `,
        [
          input.grantedBy,
          input.documentId,
          JSON.stringify({
            targetUserId: input.userId,
            permission: input.permission,
          }),
        ]
      );
    }

    commitAttempted = true;
    await client.query("COMMIT");
    transactionCommitted = true;

    return result.rows[0];
  } catch (error) {
    if (transactionStarted && !transactionCommitted && !commitAttempted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "Grant permission transaction rollback failed:",
          rollbackError
        );
      }
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function revokePermission(input: {
  documentId: string;
  userId: string;
  revokedBy: string;
}) {
  const client = await pool.connect();
  let transactionStarted = false;
  let transactionCommitted = false;
  let commitAttempted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    const document = await client.query(
      `
      SELECT id, owner_id
      FROM documents
      WHERE id = $1
        AND is_deleted = false
      `,
      [input.documentId]
    );

    if (document.rowCount === 0) {
      throw new Error("DOCUMENT_NOT_FOUND");
    }

    if (document.rows[0].owner_id !== input.revokedBy) {
      throw new Error("NOT_DOCUMENT_OWNER");
    }

    const result = await client.query(
      `
      UPDATE document_permissions
      SET
        is_active = false,
        revoked_at = NOW()
      WHERE document_id = $1
        AND user_id = $2
        AND is_active = true
      RETURNING *
      `,
      [
        input.documentId,
        input.userId,
      ]
    );

    if (result.rowCount === 0) {
      throw new Error("PERMISSION_NOT_FOUND");
    }

    await client.query(
      `
      INSERT INTO audit_logs
        (user_id, document_id, action, success, details)
      VALUES
        ($1, $2, 'permission_revoked', true, $3)
      `,
      [
        input.revokedBy,
        input.documentId,
        JSON.stringify({
          targetUserId: input.userId,
        }),
      ]
    );

    commitAttempted = true;
    await client.query("COMMIT");
    transactionCommitted = true;

    return result.rows[0];
  } catch (error) {
    if (transactionStarted && !transactionCommitted && !commitAttempted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "Revoke permission transaction rollback failed:",
          rollbackError
        );
      }
    }

    throw error;
  } finally {
    client.release();
  }
}
export async function checkDocumentAccess(input: {
  documentId: string;
  userId: string;
  requiredPermission: PermissionType;
}) {
  const result = await pool.query(
    `
    SELECT
      d.id,
      d.owner_id,
      d.storage_path,
      d.original_filename,
      d.mime_type,
      d.file_size,
      dp.permission
    FROM documents d
    LEFT JOIN document_permissions dp
      ON dp.document_id = d.id
      AND dp.user_id = $2
      AND dp.is_active = true
    WHERE d.id = $1
      AND d.is_deleted = false
    `,
    [
      input.documentId,
      input.userId,
    ]
  );

  if (result.rowCount === 0) {
    return {
      allowed: false,
      document: null,
      reason: "DOCUMENT_NOT_FOUND",
    };
  }

  const document = result.rows[0];

  /*
   * Owners always have access to their own documents.
   */
  if (document.owner_id === input.userId) {
    return {
      allowed: true,
      document,
      reason: "OWNER",
    };
  }

  /*
   * No active permission = no access.
   */
  if (!document.permission) {
    return {
      allowed: false,
      document,
      reason: "NO_PERMISSION",
    };
  }

  /*
   * EDIT permission also allows READ operations.
   */
  if (
    input.requiredPermission === "read" &&
    (document.permission === "read" ||
      document.permission === "edit")
  ) {
    return {
      allowed: true,
      document,
      reason: "PERMISSION",
    };
  }

  /*
   * EDIT operations require EDIT permission.
   */
  if (
    input.requiredPermission === "edit" &&
    document.permission === "edit"
  ) {
    return {
      allowed: true,
      document,
      reason: "PERMISSION",
    };
  }

  return {
    allowed: false,
    document,
    reason: "INSUFFICIENT_PERMISSION",
  };
}
