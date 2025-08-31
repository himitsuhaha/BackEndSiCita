// src/controllers/alert.controller.js
import { alertService } from "../services/alert.service.js";

export const alertController = {
  /**
   * Mengambil semua riwayat alert (dengan filter dari query string).
   */
  async getAllAlerts(req, res, next) {
    try {
      // Semua filter diambil dari req.query
      const result = await alertService.getAlertHistory(req.query);
      res.status(200).json({
        status: "success",
        message: "Riwayat alert berhasil diambil.",
        ...result,
      });
    } catch (error) {
      next(error); // Teruskan error ke middleware error handler
    }
  },

  /**
   * Mengambil riwayat alert untuk device ID tertentu.
   */
  async getAlertsByDeviceId(req, res, next) {
    try {
      const { deviceId } = req.params;
      // Gabungkan deviceId dari params dengan filter lain dari query
      const query = { ...req.query, deviceId };
      const result = await alertService.getAlertHistory(query);

      res.status(200).json({
        status: "success",
        message: `Riwayat alert untuk perangkat ${deviceId} berhasil diambil.`,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  },
};
