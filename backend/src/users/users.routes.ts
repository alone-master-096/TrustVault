import { Router } from "express";
import { pool } from "../config/database";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";
import { requireRoles } from "../middleware/role.middleware";

const router = Router();

router.use(authenticate, requireRoles("owner", "admin"));

router.get(
  "/search",
  async (req: AuthenticatedRequest, res) => {
    try {
      const rawQuery = req.query.q;
      const q =
        typeof rawQuery === "string"
          ? rawQuery.trim().slice(0, 100)
          : "";

      if (q.length < 2) {
        return res.status(400).json({
          error: "SEARCH_QUERY_TOO_SHORT",
          message: "Enter at least two characters.",
        });
      }

      const result = await pool.query(
        `
        SELECT id, name, email, role
        FROM public.users
        WHERE is_active = TRUE
          AND id <> $2
          AND (
            name ILIKE '%' || $1 || '%'
            OR email ILIKE '%' || $1 || '%'
          )
        ORDER BY name ASC, email ASC
        LIMIT 20
        `,
        [q, req.user!.sub]
      );

      return res.json({ users: result.rows });
    } catch (error) {
      console.error("Recipient search failed:", error);
      return res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
      });
    }
  }
);

export default router;