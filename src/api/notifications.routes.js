// src/api/notifications.routes.js
import { Router } from "express";
import { notificationController } from "../controllers/notification.controller.js";
import { authenticateJwt } from "../middlewares/auth.middleware.js"; // <-- Impor middleware autentikasi

const router = Router();

// Endpoint untuk klien (frontend) mengirimkan objek langganan push
// Biarkan publik untuk saat ini, atau proteksi jika Anda ingin langganan terikat pengguna login
router.post("/subscribe", notificationController.handleSubscribe);

// Endpoint untuk klien (frontend) mengambil preferensi notifikasi saat ini
// Lindungi endpoint ini karena berkaitan dengan preferensi pengguna (meskipun diidentifikasi via endpoint)
router.get(
  "/notification-preferences",
  authenticateJwt,
  notificationController.getNotificationPreferences
);

// Endpoint untuk klien (frontend) menyimpan/memperbarui preferensi notifikasi
// Lindungi endpoint ini juga
router.post(
  "/notification-preferences",
  authenticateJwt,
  notificationController.updateNotificationPreferences
);

export default router;
