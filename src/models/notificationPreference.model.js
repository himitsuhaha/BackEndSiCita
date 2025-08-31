// src/models/notificationPreference.model.js
import { pool } from "../config/database.config.js";

export const notificationPreferenceModel = {
  /**
   * Mengambil semua device_id yang dipilih untuk suatu push_subscription_id.
   * @param {number} pushSubscriptionId - ID dari tabel push_subscriptions.
   * @param {pg.Client|pg.Pool} [client=pool] - Klien database opsional untuk transaksi.
   * @returns {Promise<Array<string>>} Array berisi device_id.
   */
  async findBySubscriptionId(pushSubscriptionId, client = pool) {
    const queryText = `
      SELECT device_id FROM public.device_notification_preferences
      WHERE push_subscription_id = $1;
    `;
    try {
      const result = await client.query(queryText, [pushSubscriptionId]);
      return result.rows.map((row) => row.device_id);
    } catch (err) {
      console.error(
        `Error finding preferences for subscription ID ${pushSubscriptionId}:`,
        err.stack
      );
      throw err;
    }
  },

  /**
   * Menghapus semua preferensi untuk suatu push_subscription_id.
   * @param {number} pushSubscriptionId - ID dari tabel push_subscriptions.
   * @param {pg.Client|pg.Pool} [client=pool] - Klien database opsional untuk transaksi.
   * @returns {Promise<number>} Jumlah baris yang dihapus.
   */
  async deleteBySubscriptionId(pushSubscriptionId, client = pool) {
    const queryText = `
      DELETE FROM public.device_notification_preferences 
      WHERE push_subscription_id = $1;
    `;
    try {
      const result = await client.query(queryText, [pushSubscriptionId]);
      return result.rowCount;
    } catch (err) {
      console.error(
        `Error deleting preferences for subscription ID ${pushSubscriptionId}:`,
        err.stack
      );
      throw err;
    }
  },

  /**
   * Membuat banyak entri preferensi untuk suatu push_subscription_id.
   * @param {number} pushSubscriptionId - ID dari tabel push_subscriptions.
   * @param {Array<string>} deviceIds - Array device_id yang akan disimpan.
   * @param {pg.Client|pg.Pool} [client=pool] - Klien database opsional untuk transaksi.
   * @returns {Promise<void>}
   */
  async createMany(pushSubscriptionId, deviceIds, client = pool) {
    if (!deviceIds || deviceIds.length === 0) {
      return; // Tidak ada yang perlu dimasukkan
    }

    // Kita akan membuat query INSERT dengan multiple VALUES sets
    // Contoh: INSERT INTO ... VALUES ($1, $2), ($1, $3), ($1, $4)
    // Atau, loop dan insert satu per satu (lebih sederhana untuk saat ini dalam transaksi)

    const insertPromises = deviceIds.map((deviceId) => {
      // Opsional: validasi deviceId di sini terhadap tabel devices jika belum dilakukan di service
      const queryText = `
        INSERT INTO public.device_notification_preferences (push_subscription_id, device_id) 
        VALUES ($1, $2)
        ON CONFLICT (push_subscription_id, device_id) DO NOTHING;
      `;
      return client.query(queryText, [pushSubscriptionId, deviceId]);
    });

    try {
      await Promise.all(insertPromises);
    } catch (err) {
      console.error(
        `Error bulk creating preferences for subscription ID ${pushSubscriptionId}:`,
        err.stack
      );
      throw err;
    }
  },
};
