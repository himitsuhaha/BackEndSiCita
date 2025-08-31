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
      const { subscriptionEndpoint, deviceIds } = req.body;
      // Validasi dasar bisa ditambahkan di sini jika diperlukan,
      // tapi service sudah melakukan validasi yang lebih detail.
      await notificationService.updateNotificationPreferences(
        subscriptionEndpoint,
        deviceIds
      );
      res
        .status(200)
        .json({ message: "Notification preferences updated successfully." });
    } catch (error) {
      next(error);
    }
  },
};
