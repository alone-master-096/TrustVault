import { Router } from "express";
import { pool } from "../config/database";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";
import { requireRoles } from "../middleware/role.middleware";

const router = Router();

router.use(authenticate, requireRoles("admin", "owner"));

router.get(
  "/users",
  async (req: AuthenticatedRequest, res) => {
    try {
      const rawQuery = req.query.q;
      const q = typeof rawQuery === "string"
        ? rawQuery.trim().slice(0, 100)
        : "";

      const result = await pool.query(
        `
        SELECT id, name, email, role, is_active, created_at
        FROM public.users
        WHERE is_active = TRUE
          AND (
            $1 = ''
            OR name ILIKE '%' || $1 || '%'
            OR email ILIKE '%' || $1 || '%'
          )
        ORDER BY name ASC, email ASC
        LIMIT 50
        `,
        [q]
      );

      return res.json({ users: result.rows });
    } catch (error) {
      console.error("Admin user search failed:", error);
      return res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
      });
    }
  }
);

router.get(
  "/audit",
  async (req: AuthenticatedRequest, res) => {
    try {
      const parseBoundedInteger = (
        value: unknown,
        fallback: number,
        maximum: number
      ) => {
        if (typeof value !== "string" || !/^\d+$/.test(value)) {
          return fallback;
        }

        const parsed = Number(value);

        if (!Number.isSafeInteger(parsed)) {
          return fallback;
        }

        return Math.min(parsed, maximum);
      };

      const limit = parseBoundedInteger(req.query.limit, 50, 100);
      const offset = parseBoundedInteger(
        req.query.offset,
        0,
        1000000
      );

      const result = await pool.query(
        `
        SELECT
          a.id,
          a.user_id,
          u.name AS actor_name,
          u.email AS actor_email,
          a.document_id,
          d.name AS document_name,
          a.action,
          a.success,
          a.details,
          a.created_at
        FROM public.audit_logs AS a
        LEFT JOIN public.users AS u
          ON u.id = a.user_id
        LEFT JOIN public.documents AS d
          ON d.id = a.document_id
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT $1 OFFSET $2
        `,
        [limit, offset]
      );

      return res.json({
        auditLogs: result.rows,
        pagination: {
          limit,
          offset,
          returned: result.rows.length,
        },
      });
    } catch (error) {
      console.error("Admin audit query failed:", error);
      return res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
      });
    }
  }
);

export default router;