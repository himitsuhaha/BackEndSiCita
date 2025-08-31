// src/services/device.service.js
import { deviceModel } from "../models/device.model.js";
import { latestReadingModel } from "../models/latestReading.model.js"; // <-- IMPORT BARU
import crypto from "crypto"; // Tetap diimpor karena digunakan oleh generateAndSetApiKey

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name; // Untuk kejelasan error
    Error.captureStackTrace(this, this.constructor); // Untuk stack trace yang lebih baik
  }
}
// bcrypt dan SALT_ROUNDS tidak digunakan lagi sesuai dengan kode dasar Anda

export const deviceService = {
  async getAllDevices() {
    return await deviceModel.findAll();
  },

  async getDeviceById(deviceId) {
    if (!deviceId) {
      throw new AppError("Device ID is required", 400);
    }
    const device = await deviceModel.findById(deviceId);
    if (!device) {
      // Dibuat konsisten untuk tidak throw error di sini jika akan ditangani controller
      // Namun untuk getDeviceById, biasanya diharapkan device ada, jadi 404 tetap relevan.
      throw new AppError("Device not found", 404);
    }
    return device;
  },

  /**
   * Membuat perangkat baru. API Key tidak dibuat di sini lagi.
   * @param {Object} deviceData - Data dari request body.
   * @returns {Promise<{device: Object}>} Objek berisi device yang dibuat.
   */
  async createDevice(deviceData) {
    const { device_id } = deviceData; // device_id wajib ada

    if (
      !device_id ||
      typeof device_id !== "string" ||
      device_id.trim() === ""
    ) {
      throw new AppError("Device ID wajib diisi dan tidak boleh kosong.", 400);
    }
    if (/\s/.test(device_id.trim())) {
      throw new AppError("Device ID tidak boleh mengandung spasi.", 400);
    }
    // Tambahkan validasi lain untuk field yang wajib jika perlu

    // api_key_hash sekarang akan null saat pembuatan awal
    const newDeviceDataWithNullApiKey = {
      ...deviceData,
      api_key_hash: null, // Set api_key_hash menjadi null secara eksplisit
    };

    try {
      const createdDevice = await deviceModel.create(
        newDeviceDataWithNullApiKey
      );
      return { device: createdDevice };
    } catch (error) {
      if (error.statusCode) throw error; // Error dari model (misal, duplikat device_id)
      console.error("Service error creating device:", error);
      throw new AppError("Gagal membuat perangkat baru di database.", 500);
    }
  },

  async updateDevice(deviceId, updateData) {
    if (!deviceId) {
      throw new AppError("Device ID is required for update", 400);
    }
    if (Object.keys(updateData).length === 0) {
      throw new AppError("No data provided for update", 400);
    }

    const validatedUpdates = {};
    const allowedFieldsToValidate = {
      location: (val) =>
        typeof val === "string" || val === null ? val : undefined,
      description: (val) =>
        typeof val === "string" || val === null ? val : undefined,
      sensor_height_cm: (val) => {
        if (val === null || val === "") return null;
        const num = Number(val);
        return !isNaN(num) && num >= 0 ? num : undefined;
      },
      latitude: (val) => {
        if (val === null || val === "") return null;
        const num = Number(val);
        return !isNaN(num) && num >= -90 && num <= 90 ? num : undefined;
      },
      longitude: (val) => {
        if (val === null || val === "") return null;
        const num = Number(val);
        return !isNaN(num) && num >= -180 && num <= 180 ? num : undefined;
      },
      alert_threshold_percentage: (val) => {
        if (val === null || val === "") return null;
        const num = Number(val);
        return !isNaN(num) && num >= 0 && num <= 1 ? num : undefined;
      },
      alert_threshold_absolute_cm: (val) => {
        if (val === null || val === "") return null;
        const num = Number(val);
        return !isNaN(num) && num >= 0 ? num : undefined;
      },
    };

    let hasValidUpdate = false;
    for (const key in updateData) {
      if (allowedFieldsToValidate.hasOwnProperty(key)) {
        const validatedValue = allowedFieldsToValidate[key](updateData[key]);
        if (validatedValue !== undefined) {
          validatedUpdates[key] = validatedValue;
          hasValidUpdate = true;
        } else if (updateData[key] !== undefined) {
          throw new AppError(`Invalid value or type for field: ${key}`, 400);
        }
      }
    }

    if (!hasValidUpdate) {
      throw new AppError("No valid fields to update provided.", 400);
    }

    const updatedDevice = await deviceModel.update(deviceId, validatedUpdates);
    if (!updatedDevice) {
      throw new AppError("Device not found or update failed", 404);
    }
    return updatedDevice;
  },

  async ensureDeviceExists(deviceData) {
    // Fungsi ini mungkin perlu penyesuaian jika createForAutoRegistration
    // juga seharusnya tidak menghasilkan API key secara otomatis.
    // Untuk saat ini, kita asumsikan model menanganinya dengan benar.
    return await deviceModel.createForAutoRegistration(deviceData);
  },

  async deleteDevice(deviceId) {
    const deletedDevice = await deviceModel.removeById(deviceId);
    if (!deletedDevice) {
      throw new AppError(
        `Perangkat dengan ID ${deviceId} tidak ditemukan untuk dihapus.`,
        404
      );
    }
    return deletedDevice;
  },

  async generateAndSetApiKey(deviceId) {
    if (!deviceId) {
      throw new AppError("Device ID is required to generate API key", 400);
    }

    const device = await deviceModel.findById(deviceId);
    if (!device) {
      throw new AppError("Device not found", 404);
    }

    // Menggunakan crypto untuk API key (bukan bcrypt) sesuai kode dasar Anda
    const newApiKey = crypto.randomBytes(32).toString("hex");
    const apiKeyHash = crypto
      .createHash("sha256")
      .update(newApiKey)
      .digest("hex");

    const updatedDevice = await deviceModel.setApiKeyHash(deviceId, apiKeyHash);
    if (!updatedDevice) {
      throw new AppError("Failed to update device with new API key hash", 500);
    }

    console.log(
      `[Device Service] New API key generated and hash stored for device ${deviceId}.`
    );
    return newApiKey; // Mengembalikan plain text API key hanya pada saat generate
  },

  /**
   * Mengambil data pembacaan sensor terakhir untuk satu perangkat.
   * @param {string} deviceId - ID perangkat.
   * @returns {Promise<Object|null>} Data pembacaan terakhir atau null jika tidak ada.
   */
  async getLatestReadingForDevice(deviceId) {
    if (!deviceId) {
      throw new AppError(
        "Device ID diperlukan untuk mengambil data terakhir.",
        400
      );
    }
    // Panggil model untuk mengambil data dari tabel latest_device_readings
    const latestReading = await latestReadingModel.findByDeviceId(deviceId);

    // Tidak throw error 404 di sini jika latestReading null,
    // biarkan controller yang memutuskan responsnya (misal, 200 dengan data null atau 204).
    // Jika device-nya sendiri tidak ada, getDeviceById akan throw 404 sebelumnya jika itu dipanggil.
    return latestReading;
  },
};
