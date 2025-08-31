// src/api/alert.routes.js
import { Router } from "express";
import { alertController } from "../controllers/alert.controller.js";
import { authenticateJwt } from "../middlewares/auth.middleware.js";
import { authorizeRole } from "../middlewares/role.middleware.js";

const router = Router();

// 1. Terapkan middleware autentikasi untuk SEMUA rute di dalam file ini.
// Setiap request ke /api/alerts/* harus memiliki token JWT yang valid.
router.use(authenticateJwt);

// 2. Terapkan middleware otorisasi admin untuk SEMUA rute di dalam file ini.
// Hanya pengguna dengan peran 'admin' yang bisa melanjutkan.
router.use(authorizeRole(["admin"]));

// 3. Definisikan rute spesifik yang sekarang sudah terproteksi
// GET /api/alerts -> Mengambil riwayat semua alert dengan filter
router.get("/", alertController.getAllAlerts);

// GET /api/alerts/:deviceId -> Mengambil riwayat alert untuk device tertentu
router.get("/:deviceId", alertController.getAlertsByDeviceId);

export default router;
