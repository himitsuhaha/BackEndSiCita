// src/api/devices.routes.js
import { Router } from "express";
import { deviceController } from "../controllers/device.controller.js";
import { authenticateJwt } from "../middlewares/auth.middleware.js";
import { authorizeRole } from "../middlewares/role.middleware.js";

const router = Router();

// Semua rute di bawah ini memerlukan autentikasi JWT pengguna
router.use(authenticateJwt);

router.get("/", deviceController.listDevices, authenticateJwt);
router.get("/:deviceId", deviceController.getDeviceById, authenticateJwt);
router.patch("/:deviceId", deviceController.updateDevice, authenticateJwt);
router.get(
  "/:deviceId/latest-reading",
  deviceController.getDeviceLatestReading,
  authenticateJwt
);

// Rute baru untuk generate/re-generate API Key
router.post(
  "/:deviceId/api-key",
  deviceController.regenerateApiKey,
  authenticateJwt
);

// --- Rute Khusus Admin ---
// POST /api/devices - Membuat device baru (Hanya Admin)
router.post("/", authorizeRole(["admin"]), deviceController.createDevice);

// PATCH /api/devices/:deviceId - Update device (Hanya Admin)
router.patch(
  "/:deviceId",
  authorizeRole(["admin"]),
  deviceController.updateDevice
);

// DELETE /api/devices/:deviceId - Hapus device (Hanya Admin)
router.delete(
  "/:deviceId",
  authorizeRole(["admin"]),
  deviceController.deleteDevice
);

// POST /api/devices/:deviceId/api-key - Regenerate API Key (Hanya Admin)
router.post(
  "/:deviceId/api-key",
  authorizeRole(["admin"]),
  deviceController.regenerateApiKey
);

export default router;
