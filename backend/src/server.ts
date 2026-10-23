import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";

import { pool } from "./config/database";

import authRoutes from "./auth/auth.routes";
import documentRoutes from "./documents/document.routes";
import permissionRoutes from "./permissions/permission.routes";
import adminRoutes from "./admin/admin.routes";
import usersRoutes from "./users/users.routes";

import {
  authenticate,
  type AuthenticatedRequest,
} from "./middleware/auth.middleware";

const app = express();
const PORT = Number(process.env.PORT) || 5000;

app.use(helmet());
const allowedOrigins = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
]);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Origin not allowed by CORS"));
  },
}));
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.json({
    message: "TrustVault API",
    version: "1.0.0",
    status: "running",
  });
});

app.get("/api/health", async (_req, res) => {
  try {
    const result = await pool.query(
      "SELECT NOW() AS database_time"
    );

    res.json({
      status: "ok",
      database: "connected",
      databaseTime: result.rows[0].database_time,
    });
  } catch (error) {
    console.error(
      "Health check database error:",
      error
    );

    res.status(503).json({
      status: "error",
      database: "disconnected",
    });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/users", usersRoutes);

app.get(
  "/api/auth/me",
  authenticate,
  async (req: AuthenticatedRequest, res) => {
    try {
      const result = await pool.query(
        `
        SELECT id, name, email, role, is_active
        FROM users
        WHERE id = $1
        `,
        [req.user!.sub]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          error: "USER_NOT_FOUND",
        });
      }

      const user = result.rows[0];

      if (!user.is_active) {
        return res.status(403).json({
          error: "ACCOUNT_DISABLED",
        });
      }

      return res.json({
        user,
      });
    } catch (error) {
      console.error(
        "Me endpoint error:",
        error
      );

      return res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
      });
    }
  }
);

app.use(
  "/api/documents",
  documentRoutes
);

app.use(
  "/api/documents",
  permissionRoutes
);

app.listen(PORT, () => {
  console.log(
    `TrustVault API running on http://localhost:${PORT}`
  );
});
