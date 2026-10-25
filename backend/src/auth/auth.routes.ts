import { Router } from "express";
import { register, login, requestReset, completeReset } from "./auth.controller";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password", requestReset);
router.post("/reset-password", completeReset);

export default router;
