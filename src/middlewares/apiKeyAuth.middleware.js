// src/middlewares/apiKeyAuth.middleware.js
import crypto from "crypto";
import { deviceModel } from "../models/device.model.js"; // Untuk mengambil api_key_hash

export const authenticateApiKey = async (req, res, next) => {
  const apiKey = req.headers["x-api-key"]; // Ambil API Key dari header kustom
  const deviceId = req.body.deviceId; // Asumsi deviceId ada di body untuk endpoint sensor-data

  if (!apiKey) {
    return res
      .status(401)
      .json({ message: "Akses ditolak: X-API-Key header tidak ditemukan." });
  }
  if (!deviceId) {
    // Jika deviceId tidak ada di body, kita tidak bisa memvalidasi API Key spesifik device
    // Ini mungkin perlu disesuaikan jika deviceId juga ada di header atau path untuk endpoint tertentu
    return res
      .status(400)
      .json({
        message: "deviceId diperlukan di body request untuk validasi API Key.",
      });
  }

  try {
    const device = await deviceModel.findById(deviceId);
    if (!device || !device.api_key_hash) {
      console.warn(
        `[API Key Auth] Perangkat ${deviceId} tidak ditemukan atau tidak memiliki api_key_hash.`
      );
      return res
        .status(403)
        .json({
          message:
            "Akses ditolak: Perangkat tidak dikenal atau API Key tidak valid.",
        });
    }

    // Hash API Key yang diterima dari request menggunakan algoritma yang sama
    const receivedApiKeyHash = crypto
      .createHash("sha256")
      .update(apiKey)
      .digest("hex");

    if (receivedApiKeyHash === device.api_key_hash) {
      // API Key valid, tambahkan info perangkat ke request jika perlu
      // req.device = device; // Controller bisa menggunakan ini jika perlu
      console.log(`[API Key Auth] Akses diberikan untuk perangkat ${deviceId}`);
      next(); // Lanjutkan ke handler berikutnya
    } else {
      console.warn(
        `[API Key Auth] API Key tidak valid untuk perangkat ${deviceId}. Received hash: ${receivedApiKeyHash}, Stored hash: ${device.api_key_hash}`
      );
      return res
        .status(403)
        .json({ message: "Akses ditolak: API Key tidak valid." });
    }
  } catch (error) {
    console.error("[API Key Auth] Error selama validasi API Key:", error);
    return res
      .status(500)
      .json({ message: "Kesalahan server internal saat validasi API Key." });
  }
};
