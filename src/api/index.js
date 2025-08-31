// src/api/index.js
import { Router } from "express";
import deviceRoutes from "./devices.routes.js";
import sensorDataRoutes from "./sensorData.routes.js";
import notificationRoutes from "./notifications.routes.js";
import authRoutes from "./auth.routes.js";
import userRoutes from "./users.routes.js";
import alertRoutes from "./alert.routes.js";

const router = Router();

// Mount rute dengan prefixnya masing-masing
router.use("/auth", authRoutes); // <-- Mount rute autentikasi di bawah /auth
router.use("/devices", deviceRoutes);
router.use("/sensor-data", sensorDataRoutes);
router.use("/", notificationRoutes); // Rute notifikasi tetap di root /api (untuk /subscribe, dll)
router.use("/users", userRoutes);
router.use("/alerts", alertRoutes);

export default router;
