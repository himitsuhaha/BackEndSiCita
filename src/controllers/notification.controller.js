// src/controllers/notification.controller.js
import { notificationService } from "../services/notification.service.js";

export const notificationController = {
  /**
   * Menangani penyimpanan langganan push baru.
   */
  async handleSubscribe(req, res, next) {
    try {
      const subscriptionObject = req.body;
      const result = await notificationService.subscribeToPush(
        subscriptionObject
      );
      // Service akan mengembalikan langganan yang baru dibuat atau yang sudah ada
      res.status(201).json({
        message: "Subscription processed successfully.",
        subscriptionId: result.id, // Mengembalikan ID langganan dari database
      });
    } catch (error) {
      next(error); // Teruskan error ke global error handler
    }
  },

  /**
   * Mengambil preferensi notifikasi perangkat untuk suatu langganan.
   */
  async getNotificationPreferences(req, res, next) {
    try {
      const { subscriptionEndpoint } = req.query;
      if (!subscriptionEndpoint) {
        // Validasi dasar di controller, service akan melakukan validasi lebih lanjut
        return res
          .status(400)
          .json({
            error: 'Query parameter "subscriptionEndpoint" is required.',
          });
      }
      const deviceIds = await notificationService.getNotificationPreferences(
        subscriptionEndpoint
      );
      res.status(200).json({ deviceIds });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Memperbarui preferensi notifikasi perangkat untuk suatu langganan.
   */
  async updateNotificationPreferences(req, res, next) {
    try {
      // ▼▼▼ PERBAIKAN DI SINI ▼▼▼
      // Ambil fcmToken dari body bersama dengan data lainnya
      const { subscriptionEndpoint, fcmToken, deviceIds } = req.body;
      
      // Kirim semua parameter yang relevan ke service dalam satu objek
      await notificationService.updateNotificationPreferences({
        subscriptionEndpoint,
        fcmToken,
        deviceIds,
      });
      // ▲▲▲ AKHIR PERBAIKAN ▲▲▲
      
      res
        .status(200)
        .json({ message: "Notification preferences updated successfully." });
    } catch (error) {
      next(error);
    }
  },
};