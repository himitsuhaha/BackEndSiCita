// src/models/latestReading.model.js
import { pool } from "../config/database.config.js";

export const latestReadingModel = {
  /**
   * Melakukan UPSERT (Update atau Insert) data ke tabel latest_device_readings.
   * @param {Object} readingData - Data pembacaan sensor terbaru.
   * @param {string} readingData.device_id
   * @param {Date} readingData.timestamp
   * @param {number|null} readingData.water_level_cm
   * @param {number|null} readingData.raw_distance_cm
   * @param {number|null} readingData.tds_ppm
   * @param {number|null} readingData.turbidity_ntu
   * @param {number|null} readingData.ph_value
   * @param {number|null} readingData.temperature_c
   * @param {number|null} readingData.rainfall_value_raw
   * @returns {Promise<Object>} Objek data sensor terbaru yang di-upsert.
   */
  async upsert(readingData) {
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
      INSERT INTO public.latest_device_readings (
        device_id, 
        "timestamp", 
        water_level_cm, 
        previous_timestamp, 
        previous_water_level_cm, 
        raw_distance_cm, 
        tds_ppm, 
        turbidity_ntu, 
        ph_value, 
        temperature_c, 
        rainfall_value_raw,
        last_updated_at
      ) VALUES (
        $1, $2, $3, 
        NULL, NULL, -- previous_timestamp dan previous_water_level_cm diisi NULL saat INSERT awal
        $4, $5, $6, $7, $8, $9, 
        NOW()
      )
      ON CONFLICT (device_id) DO UPDATE SET
        previous_timestamp = latest_device_readings."timestamp",        
        previous_water_level_cm = latest_device_readings.water_level_cm, 
        "timestamp" = EXCLUDED."timestamp",                              
        water_level_cm = EXCLUDED.water_level_cm,                        
        raw_distance_cm = EXCLUDED.raw_distance_cm,
        tds_ppm = EXCLUDED.tds_ppm,
        turbidity_ntu = EXCLUDED.turbidity_ntu,
        ph_value = EXCLUDED.ph_value,
        temperature_c = EXCLUDED.temperature_c,
        rainfall_value_raw = EXCLUDED.rainfall_value_raw,
        last_updated_at = NOW()
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
      console.error("Error upserting latest reading:", err.stack);
      throw err;
    }
  },

  /**
   * Mengambil data pembacaan terakhir untuk deviceId tertentu.
   * @param {string} deviceId - ID perangkat.
   * @returns {Promise<Object|null>} Objek data pembacaan terakhir atau null jika tidak ditemukan.
   */
  async findByDeviceId(deviceId) {
    const queryText = `
      SELECT 
        device_id, 
        "timestamp", 
        water_level_cm, 
        previous_timestamp, 
        previous_water_level_cm, 
        raw_distance_cm, 
        tds_ppm, 
        turbidity_ntu, 
        ph_value, 
        temperature_c, 
        rainfall_value_raw,
        last_updated_at 
      FROM public.latest_device_readings 
      WHERE device_id = $1;
    `;
    try {
      const result = await pool.query(queryText, [deviceId]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
      console.error(
        `Error finding latest reading for device ${deviceId}:`,
        err.stack
      );
      throw err;
    }
  },
};
