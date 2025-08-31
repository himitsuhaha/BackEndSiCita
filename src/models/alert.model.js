import { pool } from "../config/database.config.js";

export const alertModel = {
  /**
   * Menyimpan alert baru ke database.
   */
  async create(alertData) {
    const {
      device_id,
      alert_type,
      message,
      severity = "warning",
      triggering_sensor_data = null,
      sensor_data_timestamp,
    } = alertData;

    const queryText = `
      INSERT INTO public.device_alerts (
        device_id, alert_type, message, severity, triggering_sensor_data, 
        alert_triggered_at, sensor_data_timestamp, is_active
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), $6, TRUE)
      RETURNING *;
    `;
    const values = [
      device_id,
      alert_type,
      message,
      severity,
      triggering_sensor_data ? JSON.stringify(triggering_sensor_data) : null,
      sensor_data_timestamp,
    ];

    try {
      const result = await pool.query(queryText, values);
      console.log(
        `[Alert Model] New alert created with ID: ${result.rows[0].id} for device ${device_id}`
      );
      return result.rows[0];
    } catch (err) {
      console.error("Error creating alert in database:", err.stack);
      throw err;
    }
  },

  /**
   * Menemukan alert aktif terakhir untuk tipe tertentu pada device tertentu.
   */
  async findActiveAlert(deviceId, alertType) {
    const queryText = `
      SELECT * FROM public.device_alerts
      WHERE device_id = $1 AND alert_type = $2 AND is_active = TRUE
      ORDER BY alert_triggered_at DESC
      LIMIT 1;
    `;
    try {
      const result = await pool.query(queryText, [deviceId, alertType]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
      console.error(
        `Error finding active alert for ${deviceId}, type ${alertType}:`,
        err.stack
      );
      throw err;
    }
  },

  /**
   * Menandai alert tertentu sebagai tidak aktif (resolved).
   */
  async markAsResolved(alertId) {
    const queryText = `
      UPDATE public.device_alerts
      SET is_active = FALSE, resolved_at = NOW()
      WHERE id = $1 AND is_active = TRUE
      RETURNING *;
    `;
    try {
      const result = await pool.query(queryText, [alertId]);
      if (result.rows.length > 0) {
        console.log(`[Alert Model] Alert ID: ${alertId} marked as resolved.`);
        return result.rows[0];
      }
      return null;
    } catch (err) {
      console.error(
        `Error marking alert ID ${alertId} as resolved:`,
        err.stack
      );
      throw err;
    }
  },

  /**
   * Menemukan semua alert dengan filter, paginasi, dan pengurutan.
   * Mendukung filter berdasarkan deviceId, alertType, status aktif, severity, dan rentang tanggal.
   */
  async findAll(filters = {}) {
    const {
      deviceId,
      alertType,
      isActive,
      severity, // <-- Tambahan
      startDate,
      endDate,
      limit = 25,
      offset = 0,
      sortBy = "alert_triggered_at",
      sortOrder = "DESC",
    } = filters;

    let baseQuery = `SELECT * FROM public.device_alerts a`;
    let countQuery = `SELECT COUNT(*) FROM public.device_alerts a`;

    const whereClauses = [];
    const queryParams = [];

    if (deviceId) {
      queryParams.push(deviceId);
      whereClauses.push(`a.device_id = $${queryParams.length}`);
    }
    if (alertType) {
      queryParams.push(alertType);
      whereClauses.push(`a.alert_type = $${queryParams.length}`);
    }
    if (isActive !== undefined) {
      queryParams.push(Boolean(isActive));
      whereClauses.push(`a.is_active = $${queryParams.length}`);
    }
    // ▼▼▼ LOGIKA BARU UNTUK FILTER SEVERITY ▼▼▼
    if (severity) {
      queryParams.push(severity);
      whereClauses.push(`a.severity = $${queryParams.length}`);
    }
    if (startDate) {
      queryParams.push(startDate);
      whereClauses.push(`a.alert_triggered_at >= $${queryParams.length}`);
    }
    if (endDate) {
      queryParams.push(endDate);
      whereClauses.push(`a.alert_triggered_at <= $${queryParams.length}`);
    }

    if (whereClauses.length > 0) {
      const whereString = ` WHERE ${whereClauses.join(" AND ")}`;
      baseQuery += whereString;
      countQuery += whereString;
    }

    const allowedSortBy = [
      "alert_triggered_at",
      "severity",
      "alert_type",
      "device_id",
    ];
    const safeSortBy = allowedSortBy.includes(sortBy)
      ? `a.${sortBy}`
      : "a.alert_triggered_at";
    const safeSortOrder = sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";

    baseQuery += ` ORDER BY ${safeSortBy} ${safeSortOrder}`;
    baseQuery += ` LIMIT $${queryParams.length + 1}`;
    baseQuery += ` OFFSET $${queryParams.length + 2}`;

    const queryValues = [...queryParams, limit, offset];

    try {
      const totalResult = await pool.query(countQuery, queryParams);
      const totalCount = parseInt(totalResult.rows[0].count, 10);
      const alertsResult = await pool.query(baseQuery, queryValues);

      return {
        alerts: alertsResult.rows,
        totalCount: totalCount,
      };
    } catch (err) {
      console.error("Error finding all alerts in model:", err.stack);
      throw err;
    }
  },
};
