// src/models/device.model.js
import { pool } from "../config/database.config.js"; // Impor pool koneksi database

export const deviceModel = {
  /**
   * Mengambil semua perangkat dari database.
   * @returns {Promise<Array>} Array objek perangkat.
   */
  async findAll() {
    const queryText = "SELECT * FROM public.devices ORDER BY device_id ASC";
    try {
      const result = await pool.query(queryText);
      return result.rows;
    } catch (err) {
      console.error("Error executing findAll devices query:", err.stack);
      throw err; // Lemparkan error agar bisa ditangani oleh service/controller
    }
  },

  /**
   * Mencari perangkat berdasarkan device_id.
   * @param {string} deviceId - ID perangkat yang dicari.
   * @returns {Promise<Object|null>} Objek perangkat jika ditemukan, atau null.
   */
  async findById(deviceId) {
    const queryText = "SELECT * FROM public.devices WHERE device_id = $1";
    try {
      const result = await pool.query(queryText, [deviceId]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
      console.error(
        `Error executing findById device query for ${deviceId}:`,
        err.stack
      );
      throw err;
    }
  },

  /**
   * Membuat perangkat baru di database.
   * @param {Object} deviceData - Data perangkat yang akan dibuat.
   * @returns {Promise<Object>} Objek perangkat yang baru dibuat.
   */
  async create(deviceData) {
    const {
      device_id,
      location,
      sensor_height_cm,
      latitude,
      longitude,
      description,
      alert_threshold_percentage,
      alert_threshold_absolute_cm,
      api_key_hash, // Ini akan bernilai NULL jika dikirim dari service untuk pembuatan baru
    } = deviceData;

    // Pastikan 'name' ditambahkan jika ada di deviceData dan tabel DB
    // const name = deviceData.name;

    const queryText = `
      INSERT INTO public.devices (
        device_id, location, sensor_height_cm, latitude, longitude, 
        description, alert_threshold_percentage, alert_threshold_absolute_cm, 
        api_key_hash, -- Kolom ini tetap ada di query
        is_offline, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 
        $9,
        false, NOW(), NOW()
      )
      RETURNING *;
    `;
    const values = [
      device_id,
      location,
      sensor_height_cm,
      latitude,
      longitude,
      description,
      alert_threshold_percentage,
      alert_threshold_absolute_cm,
      api_key_hash,
    ];

    try {
      const result = await pool.query(queryText, values);
      return result.rows[0];
    } catch (err) {
      // Tangani error spesifik, misalnya jika device_id sudah ada (unique constraint)
      if (err.code === "23505") {
        // Kode error PostgreSQL untuk unique violation
        const appError = new Error(`Device ID '${device_id}' sudah terdaftar.`);
        appError.statusCode = 409; // Status Conflict (JavaScript-friendly)
        throw appError;
      }
      console.error(
        `Error executing create device query for ${device_id}:`,
        err.stack
      );
      throw err; // Lemparkan error asli jika bukan unique violation yang dikenal
    }
  },

  /**
   * Memperbarui perangkat di database.
   * @param {string} deviceId - ID perangkat yang akan diperbarui.
   * @param {Object} updates - Objek berisi field dan nilai baru.
   * @returns {Promise<Object|null>} Objek perangkat yang sudah diperbarui, atau null jika tidak ditemukan.
   */
  async update(deviceId, updates) {
    const setClauses = [];
    const values = [];
    let valueCount = 1;

    for (const key in updates) {
      if (updates.hasOwnProperty(key) && updates[key] !== undefined) {
        setClauses.push(`${key} = $${valueCount++}`);
        values.push(updates[key]);
      }
    }

    setClauses.push(`updated_at = NOW()`);

    if (setClauses.length === 1 && Object.keys(updates).length === 0) {
      // Kondisi ini berarti tidak ada field valid yang dikirim untuk diupdate
      // selain 'updated_at' yang ditambahkan secara otomatis.
      // Bisa jadi tidak melakukan query atau mengembalikan data device apa adanya.
      // Untuk saat ini, kita akan membiarkan query berjalan jika setClauses memiliki 'updated_at',
      // namun idealnya service harus memastikan 'updates' tidak kosong jika memang ada perubahan.
    }

    values.push(deviceId); // Untuk klausa WHERE device_id = $N

    const queryText = `
      UPDATE public.devices 
      SET ${setClauses.join(", ")} 
      WHERE device_id = $${valueCount}
      RETURNING *;
    `;

    try {
      const result = await pool.query(queryText, values);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
      console.error(
        `Error executing update device query for ${deviceId}:`,
        err.stack
      );
      throw err;
    }
  },

  /**
   * Menghapus perangkat berdasarkan device_id.
   * @param {string} deviceId - ID perangkat yang akan dihapus.
   * @returns {Promise<Object|null>} Objek perangkat yang dihapus, atau null jika tidak ditemukan.
   */
  async removeById(deviceId) {
    const queryText =
      "DELETE FROM public.devices WHERE device_id = $1 RETURNING *;";
    try {
      const result = await pool.query(queryText, [deviceId]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
      console.error(
        `Error executing removeById device query for ${deviceId}:`,
        err.stack
      );
      throw err;
    }
  },

  /**
   * Membuat entri perangkat baru jika belum ada (untuk auto-registration).
   * @param {Object} deviceData - Data perangkat dasar (minimal device_id).
   * @returns {Promise<Object|null>} Objek perangkat yang dibuat atau null.
   */
  async createForAutoRegistration(deviceData) {
    const { deviceId, location, sensor_height_cm, description } = deviceData; // Menggunakan deviceId untuk konsistensi nama parameter
    const queryText = `
      INSERT INTO public.devices (device_id, location, sensor_height_cm, description, is_offline, created_at, updated_at)
      VALUES ($1, $2, $3, $4, false, NOW(), NOW())
      ON CONFLICT (device_id) DO NOTHING
      RETURNING *; 
    `;
    try {
      const result = await pool.query(queryText, [
        deviceId, // Menggunakan deviceId yang di-destructure
        location || `Auto-registered: ${deviceId}`,
        sensor_height_cm || null,
        description || "Device auto-registered via sensor data endpoint.",
      ]);
      if (result.rows.length > 0) {
        return result.rows[0];
      }
      // Jika terjadi konflik dan DO NOTHING, ambil data yang sudah ada
      console.log(
        `Device ${deviceId} already exists (auto-registration). Fetching existing.`
      );
      return this.findById(deviceId);
    } catch (err) {
      console.error(
        `Error executing createForAutoRegistration for device ${deviceId}:`,
        err.stack
      );
      throw err;
    }
  },

  /**
   * Memperbarui api_key_hash dan api_key_updated_at untuk perangkat tertentu.
   * @param {string} deviceId - ID perangkat yang akan diperbarui.
   * @param {string} apiKeyHash - Hash dari API Key baru.
   * @returns {Promise<Object|null>} Objek perangkat yang sudah diperbarui.
   */
  async setApiKeyHash(deviceId, apiKeyHash) {
    const queryText = `
     UPDATE public.devices
     SET 
      api_key_hash = $1, 
      api_key_updated_at = NOW() 
      WHERE device_id = $2
    RETURNING *;
    `;
    try {
      const result = await pool.query(queryText, [apiKeyHash, deviceId]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
      console.error(
        `Error setting API key hash for device ${deviceId}:`,
        err.stack
      );
      throw err;
    }
  },

  /**
   * Memperbarui status is_offline untuk perangkat tertentu.
   * @param {string} deviceId - ID perangkat.
   * @param {boolean} isOffline - Status offline baru (true atau false).
   * @returns {Promise<Object|null>} Objek perangkat yang diperbarui atau null jika tidak ditemukan.
   */
  async updateOfflineStatus(deviceId, isOffline) {
    const queryText = `
      UPDATE public.devices
      SET is_offline = $1, updated_at = NOW()
      WHERE device_id = $2
      RETURNING *; 
    `;
    try {
      const result = await pool.query(queryText, [isOffline, deviceId]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
      console.error(
        `Error updating offline status for device ${deviceId} to ${isOffline}:`,
        err.stack
      );
      throw err;
    }
  },
};
