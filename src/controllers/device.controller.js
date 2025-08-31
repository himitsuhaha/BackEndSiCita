// src/controllers/device.controller.js
import { deviceService } from "../services/device.service.js";
import { io } from "../app.js"; // Impor io dari app.js untuk emit event

export const deviceController = {
  /**
   * Mengambil semua perangkat.
   */
  async listDevices(req, res, next) {
    try {
      const devices = await deviceService.getAllDevices();
      res.status(200).json(devices);
    } catch (error) {
      next(error); // Teruskan error ke global error handler
    }
  },

  /**
   * Mengambil satu perangkat berdasarkan ID.
   */
  async getDeviceById(req, res, next) {
    try {
      const { deviceId } = req.params;
      const device = await deviceService.getDeviceById(deviceId);
      res.status(200).json(device);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Menghapus perangkat berdasarkan ID.
   */
  async deleteDevice(req, res, next) {
    try {
      const { deviceId } = req.params;
      const deletedDevice = await deviceService.deleteDevice(deviceId);

      io.emit("device_deleted", {
        deviceId: deletedDevice.device_id,
        device: deletedDevice, // Mengirim seluruh objek device yang dihapus
      });
      console.log(
        `[Controller] Device ${deviceId} deleted. Emitting device_deleted event.`
      );

      res.status(200).json({
        message: `Perangkat ${
          deletedDevice.name || deletedDevice.device_id
        } berhasil dihapus.`,
        device: deletedDevice,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Membuat perangkat baru.
   */
  async createDevice(req, res, next) {
    try {
      const deviceDataFromRequest = req.body;
      const { device: newDevice } = await deviceService.createDevice(
        deviceDataFromRequest
      );

      io.emit("device_added", newDevice);
      console.log(
        `[Controller] Device ${newDevice.device_id} created. Emitting device_added event.`
      );

      res.status(201).json({
        message: `Perangkat ${newDevice.device_id} berhasil dibuat. Anda dapat men-generate API Key melalui halaman edit atau detail perangkat.`,
        device: newDevice,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Memperbarui perangkat.
   */
  async updateDevice(req, res, next) {
    try {
      const { deviceId } = req.params;
      const updateData = req.body;
      const updatedDevice = await deviceService.updateDevice(
        deviceId,
        updateData
      );

      if (updatedDevice) {
        io.emit("device_updated", updatedDevice);
        console.log(
          `[Controller] Device ${deviceId} updated. Emitting device_updated event.`
        );
      }

      res.status(200).json(updatedDevice);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Menghasilkan/Mengganti API Key untuk perangkat.
   */
  async regenerateApiKey(req, res, next) {
    try {
      const { deviceId } = req.params;
      const newPlainTextApiKey = await deviceService.generateAndSetApiKey(
        deviceId
      );

      res.status(200).json({
        message: `API Key baru berhasil dibuat untuk perangkat ${deviceId}. Harap simpan API Key ini dengan aman karena tidak akan ditampilkan lagi.`,
        apiKey: newPlainTextApiKey,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Mengambil data pembacaan sensor terakhir untuk satu perangkat.
   */
  async getDeviceLatestReading(req, res, next) {
    try {
      const { deviceId } = req.params;
      const latestReading = await deviceService.getLatestReadingForDevice(
        deviceId
      );

      if (!latestReading) {
        // Jika tidak ada data pembacaan terakhir, kirim 200 dengan null.
        // Ini memungkinkan frontend untuk menangani kasus "tidak ada data" tanpa menganggapnya error.
        return res.status(200).json(null);
      }
      res.status(200).json(latestReading);
    } catch (error) {
      next(error);
    }
  },
};
