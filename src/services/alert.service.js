// src/services/alert.service.js
import { alertModel } from "../models/alert.model.js";

// Helper untuk membuat error kustom (jika Anda punya file AppError terpusat, impor dari sana)
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const alertService = {
  /**
   * Mengambil riwayat alert dengan paginasi dan filter.
   * @param {Object} query - Query dari controller.
   * @returns {Promise<Object>}
   */
  async getAlertHistory(query) {
    // Proses query parameters untuk paginasi dan filter
    const page = parseInt(query.page, 10) || 1;
    const limit = parseInt(query.limit, 10) || 25;
    const offset = (page - 1) * limit;

    const filters = {
      limit,
      offset,
      deviceId: query.deviceId,
      alertType: query.alertType,
      severity: query.severity,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    };

    if (query.isActive !== undefined) {
      filters.isActive = query.isActive === "true";
    }

    // ▼▼▼ LOGIKA YANG DIPERBARUI ▼▼▼
    // Prioritaskan startDate/endDate dari date picker
    if (query.startDate) {
      filters.startDate = query.startDate;
    }
    if (query.endDate) {
      filters.endDate = query.endDate;
    }
    // Jika tidak ada date picker, baru gunakan timeRange
    else if (query.timeRange && query.timeRange !== "all") {
      const now = new Date();
      let daysToSubtract = 0;
      switch (query.timeRange) {
        case "7d":
          daysToSubtract = 7;
          break;
        case "30d":
          daysToSubtract = 30;
          break;
        case "90d":
          daysToSubtract = 90;
          break;
      }
      if (daysToSubtract > 0) {
        const pastDate = new Date();
        pastDate.setDate(now.getDate() - daysToSubtract);
        filters.startDate = pastDate.toISOString();
      }
    }

    try {
      const { alerts, totalCount } = await alertModel.findAll(filters);

      return {
        data: alerts,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount,
          itemsPerPage: limit,
        },
      };
    } catch (error) {
      // Tangani error spesifik jika perlu, atau lempar kembali
      console.error("[Alert Service] Error getting alert history:", error);
      throw new AppError("Gagal mengambil riwayat alert dari database.", 500);
    }
  },
};
