import { Router } from "express";

import { authenticate } from "../middleware/auth.middleware";

import {
  grantDocumentPermission,
  revokeDocumentPermission,
} from "./permission.controller";

const router = Router();

router.post(
  "/:id/permissions",
  authenticate,
  grantDocumentPermission
);

router.delete(
  "/:id/permissions",
  authenticate,
  revokeDocumentPermission
);

export default router;
