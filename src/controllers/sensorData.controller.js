// src/controllers/sensorData.controller.js
import { sensorDataService } from "../services/sensorData.service.js";

export const sensorDataController = {
  /**
   * Menangani pengiriman data sensor baru.
   */
  async handleSubmitSensorData(req, res, next) {
    // Kode Anda di sini tetap sama, karena tidak ada perubahan yang diminta untuk fungsi ini.
    try {
      const rawData = req.body;
      const result = await sensorDataService.submitSensorData(rawData);
      res.status(201).json({
        message: "Sensor data received, processed successfully.",
        latestData: result.latestReading,
        alertInfo: result.alertInfo, // Pastikan result.alertInfo dikembalikan dari service
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Mengambil data historis sensor untuk satu perangkat,
   * dengan opsi limit, sortOrder, dan filter rentang waktu.
   */
  async getDeviceHistory(req, res, next) {
    try {
      const { deviceId } = req.params;

      // Ambil 'limit'. Jika '0' dikirim (untuk ekspor), itu akan jadi 0.
      // Jika tidak ada, default ke 1000 untuk tampilan biasa.
      const limitString = req.query.limit?.toString();
      let limit;
      if (limitString === "0") {
        // Kasus khusus untuk ekspor "semua data"
        limit = 0;
      } else {
        // Default 1000 (atau sesuai preferensi Anda) jika tidak ada atau bukan "0"
        limit = parseInt(limitString || "1000", 10);
      }

      const sortOrder =
        req.query.sortOrder?.toString().toUpperCase() === "DESC"
          ? "DESC"
          : "ASC";

      const timeRange = req.query.timeRange?.toString();
      const startDate = req.query.startDate?.toString();
      const endDate = req.query.endDate?.toString();

      // --- PENYESUAIAN VALIDASI LIMIT ---
      // Sekarang limit 0 diizinkan (untuk mengambil semua data dalam rentang untuk ekspor)
      if (isNaN(limit) || limit < 0) {
        return res.status(400).json({
          error: "Invalid limit parameter. Must be a non-negative integer.",
        });
      }
      // --- AKHIR PENYESUAIAN VALIDASI LIMIT ---

      // Validasi dasar untuk startDate dan endDate jika ada (format YYYY-MM-DD)
      if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        return res
          .status(400)
          .json({ error: "Invalid startDate format. Use YYYY-MM-DD." });
      }
      if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        return res
          .status(400)
          .json({ error: "Invalid endDate format. Use YYYY-MM-DD." });
      }
      if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
        return res
          .status(400)
          .json({ error: "startDate cannot be after endDate." });
      }

      // Kumpulkan semua filter dalam satu objek untuk dikirim ke service
      const filters = {
        limit, // Ini akan menjadi 0 jika frontend mengirim limit=0 untuk ekspor
        sortOrder,
        timeRange,
        startDate,
        endDate,
      };

      // Hapus properti filter yang undefined agar tidak dikirim sebagai string "undefined"
      Object.keys(filters).forEach((key) => {
        if (filters[key] === undefined) {
          delete filters[key];
        }
      });

      const historicalData = await sensorDataService.getHistoricalData(
        deviceId,
        filters // Kirim objek filters ke service
      );
      res.status(200).json(historicalData);
    } catch (error) {
      next(error);
    }
  },
};
