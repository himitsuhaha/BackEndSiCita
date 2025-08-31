// src/api/sensorData.routes.js
import { Router } from "express";
import { sensorDataController } from "../controllers/sensorData.controller.js";
import { authenticateApiKey } from "../middlewares/apiKeyAuth.middleware.js"; // <-- Impor middleware API Key

const router = Router();

// Terapkan middleware authenticateApiKey HANYA untuk rute POST / (menerima data sensor)
router.post(
  "/",
  authenticateApiKey,
  sensorDataController.handleSubmitSensorData
);

// Rute untuk mengambil data historis mungkin tidak perlu API Key (atau bisa diproteksi dengan JWT pengguna jika diperlukan)
// Untuk saat ini, kita biarkan rute history tanpa proteksi API Key spesifik device.
router.get("/history/:deviceId", sensorDataController.getDeviceHistory);

export default router;
