// src/models/sensorReading.model.js
import { pool } from "../config/database.config.js";

export const sensorReadingModel = {
  /**
   * Membuat entri baru di tabel sensor_readings.
   * @param {Object} readingData - Data pembacaan sensor.
   * @param {string} readingData.device_id - ID perangkat.
   * @param {string|Date} readingData.timestamp - Timestamp pembacaan.
   * @param {number|null} readingData.water_level_cm - Ketinggian air dalam cm.
   * @param {number|null} readingData.raw_distance_cm - Jarak mentah sensor dalam cm.
   * @param {number|null} readingData.tds_ppm - Total Dissolved Solids dalam ppm.
   * @param {number|null} readingData.turbidity_ntu - Kekeruhan dalam NTU.
   * @param {number|null} readingData.ph_value - Nilai pH.
   * @param {number|null} readingData.temperature_c - Temperatur dalam Celsius.
   * @param {number|null} readingData.rainfall_value_raw - Nilai mentah curah hujan.
   * @returns {Promise<Object>} Objek data sensor yang baru saja dimasukkan.
   */
  async create(readingData) {
    const {
      device_id,
      timestamp,
      water_level_cm,
      raw_distance_cm,
      tds_ppm,
      turbidity_ntu,
      ph_value,
      temperature_c,
      rainfall_value_raw,
    } = readingData;

    const queryText = `
      INSERT INTO public.sensor_readings (
        device_id, "timestamp", water_level_cm, raw_distance_cm, 
        tds_ppm, turbidity_ntu, ph_value, temperature_c, rainfall_value_raw, received_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING *; 
    `;
    const values = [
      device_id,
      timestamp,
      water_level_cm,
      raw_distance_cm,
      tds_ppm,
      turbidity_ntu,
      ph_value,
      temperature_c,
      rainfall_value_raw,
    ];
    try {
      const result = await pool.query(queryText, values);
      return result.rows[0];
    } catch (err) {
      console.error("Error creating sensor reading:", err.stack);
      throw err;
    }
  },

  /**
   * Mengambil riwayat data sensor untuk deviceId tertentu dengan filter.
   * @param {string} deviceId - ID perangkat.
   * @param {object} [filters={}] - Objek filter.
   * @param {number|undefined|NaN} [filters.limit] - Jumlah data yang diambil. Jika NaN atau 0, LIMIT tidak diterapkan. Jika undefined, default model (1000) digunakan.
   * @param {'ASC'|'DESC'} [filters.sortOrder="ASC"] - Urutan data.
   * @param {string} [filters.startDate] - Tanggal mulai (format YYYY-MM-DD).
   * @param {string} [filters.endDate] - Tanggal selesai (format YYYY-MM-DD).
   * @returns {Promise<Array>} Array objek data sensor historis.
   */
  async findHistoryByDeviceId(deviceId, filters = {}) {
    const {
      limit = 1000, // Default internal model jika service tidak mengirim atau mengirim undefined
      sortOrder = "ASC",
      startDate,
      endDate,
    } = filters; // Jika filters.limit adalah NaN, maka limit di sini akan NaN.
    // Jika filters.limit adalah undefined, maka limit di sini akan 1000.

    let queryText = `
      SELECT 
        device_id, "timestamp", water_level_cm, temperature_c, 
        tds_ppm, turbidity_ntu, ph_value, raw_distance_cm, rainfall_value_raw  
      FROM public.sensor_readings
      WHERE device_id = $1 
    `;
    const values = [deviceId];
    let placeholderCount = 1;

    if (startDate) {
      placeholderCount++;
      queryText += ` AND "timestamp" >= $${placeholderCount}::date `;
      values.push(startDate);
    }
    if (endDate) {
      placeholderCount++;
      // Mencakup semua data hingga akhir hari endDate
      queryText += ` AND "timestamp" < ($${placeholderCount}::date + INTERVAL '1 day') `;
      values.push(endDate);
    }

    const validSortOrder = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";
    queryText += ` ORDER BY "timestamp" ${validSortOrder}`;

    // KUNCI: Hanya tambahkan LIMIT jika limit adalah angka positif
    // Jika 'limit' (dari destrukturisasi) adalah NaN (misal dari service), Number(NaN) adalah NaN. NaN > 0 adalah false.
    // Jika 'limit' adalah 0, Number(0) adalah 0. 0 > 0 adalah false.
    // Jika 'limit' adalah 1000 (default atau dari service), Number(1000) adalah 1000. 1000 > 0 adalah true.
    const numericLimit = Number(limit);
    if (limit !== undefined && !isNaN(numericLimit) && numericLimit > 0) {
      placeholderCount++;
      queryText += ` LIMIT $${placeholderCount}`;
      values.push(numericLimit);
    }
    // Jika limit adalah undefined (tidak di-set oleh service) dan default 1000 dari model berlaku,
    // maka numericLimit = 1000, dan !isNaN(1000) && 1000 > 0 adalah true, jadi LIMIT 1000 diterapkan.
    // Jika service mengirim filters.limit = NaN, maka numericLimit = NaN. !isNaN(NaN) adalah false, jadi LIMIT tidak diterapkan.
    // Jika service mengirim filters.limit = 0, maka numericLimit = 0. 0 > 0 adalah false, jadi LIMIT tidak diterapkan.

    queryText += `;`; // Akhiri query setelah semua klausa ditambahkan

    console.log(
      `[SensorReading Model] Executing query: ${queryText
        .replace(/\s+/g, " ")
        .trim()} with values:`,
      values
    );

    try {
      const result = await pool.query(queryText, values);
      return result.rows;
    } catch (err) {
      console.error(
        `Error fetching history for device ${deviceId} with filters: ${JSON.stringify(
          filters
        )}`,
        err.stack
      );
      throw err;
    }
  },
};
