// src/api/auth.routes.js
import { Router } from "express";
import { authController } from "../controllers/auth.controller.js";

const router = Router();

router.post("/register", authController.registerUser);
router.post("/login", authController.loginUser);
router.post("/oauth-handler", authController.handleOAuthLogin);
router.post("/mobile-oauth-login", authController.handleMobileOAuthLogin);
router.post(
  "/request-password-reset",
  authController.handleRequestPasswordReset
);
router.post("/reset-password", authController.handleResetPasswordWithToken);

export default router;
