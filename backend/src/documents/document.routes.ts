import { Router } from "express";

import { authenticate } from "../middleware/auth.middleware";

import {
  uploadMiddleware,
  uploadDocument,
  listDocuments,
  deleteDocument,
} from "./document.controller";

import {
  downloadDocument,
} from "./download.controller";

const router = Router();

router.get("/", authenticate, listDocuments);

router.post(
  "/upload",
  authenticate,
  uploadMiddleware,
  uploadDocument
);

router.delete("/:id", authenticate, deleteDocument);

router.get(
  "/:id/download",
  authenticate,
  downloadDocument
);

export default router;

