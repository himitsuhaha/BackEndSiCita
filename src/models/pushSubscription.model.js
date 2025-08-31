// src/models/pushSubscription.model.js
import { pool } from "../config/database.config.js";

export const pushSubscriptionModel = {
  /**
   * Membuat entri langganan push baru.
   * @param {Object} subscriptionObject - Objek PushSubscription dari browser.
   * @returns {Promise<Object>} Objek langganan yang baru saja dimasukkan (termasuk ID-nya).
   */
  async create(subscriptionObject) {
    const queryText = `
      INSERT INTO public.push_subscriptions (subscription_object, user_agent) 
      VALUES ($1, $2) 
      ON CONFLICT ((subscription_object ->> 'endpoint')) DO UPDATE 
      SET updated_at = NOW() -- Atau tidak melakukan apa-apa jika tidak ingin update pada konflik endpoint
      RETURNING *; 
    `;
    // Menambahkan user_agent jika ada di subscriptionObject atau bisa dikirim terpisah
    // ON CONFLICT pada endpoint adalah ide bagus untuk mencegah duplikasi langganan yang sama persis.
    // Jika endpoint sudah ada, kita bisa memilih untuk tidak melakukan apa-apa (DO NOTHING)
    // atau memperbarui 'updated_at' atau field lain jika perlu.
    // Untuk sekarang, mari kita coba DO NOTHING atau update updated_at.
    // Jika hanya menyimpan, dan frontend mengirim subscription yang sama lagi, ini akan gagal jika ada unique constraint tanpa ON CONFLICT.
    // Mari kita asumsikan ada unique constraint pada (subscription_object->>'endpoint') atau kita tangani di service.
    // Untuk penyederhanaan, jika kita tidak membuat unique constraint, INSERT biasa sudah cukup.
    // Namun, karena tabel push_subscriptions kita tidak punya unique constraint pada endpoint di skema awal, kita INSERT saja.
    // Jika ingin idempotensi berdasarkan endpoint, skema DB perlu diubah atau logika findByEndpoint dulu.
    // Mari kita buat lebih sederhana: INSERT saja, duplikasi endpoint mungkin terjadi jika klien subscribe berkali-kali tanpa unsubscribe.
    // Atau, kita tambahkan ON CONFLICT (subscription_object ->> 'endpoint') DO NOTHING jika kita anggap endpoint unik.
    // Untuk sekarang, kita buat simpel dengan ON CONFLICT (endpoint) DO NOTHING, asumsi kita bisa buat index di endpoint.

    // Query yang lebih aman jika kita belum membuat UNIQUE INDEX pada JSONB field:
    // Kita akan mencari dulu, baru insert jika tidak ada. Ini akan dilakukan di service.
    // Model ini akan fokus pada INSERT saja.
    const simpleInsertQuery = `
        INSERT INTO public.push_subscriptions (subscription_object) 
        VALUES ($1)
        RETURNING id, subscription_object, created_at;
    `;
    try {
      // Kita asumsikan subscriptionObject adalah objek JSON yang valid
      const result = await pool.query(simpleInsertQuery, [subscriptionObject]);
      return result.rows[0];
    } catch (err) {
      console.error("Error creating push subscription:", err.stack);
      throw err;
    }
  },

  /**
   * Mencari langganan push berdasarkan endpoint URL-nya.
   * @param {string} endpointUrl - URL endpoint unik dari PushSubscription.
   * @returns {Promise<Object|null>} Objek langganan (termasuk id) jika ditemukan, atau null.
   */
  async findByEndpoint(endpointUrl) {
    const queryText = `
      SELECT id, subscription_object FROM public.push_subscriptions
      WHERE subscription_object ->> 'endpoint' = $1;
    `;
    try {
      const result = await pool.query(queryText, [endpointUrl]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
      console.error(
        `Error finding push subscription by endpoint ${endpointUrl}:`,
        err.stack
      );
      throw err;
    }
  },

  /**
   * Menghapus langganan push berdasarkan ID database-nya.
   * @param {number} id - ID langganan di database.
   * @returns {Promise<boolean>} True jika berhasil dihapus, false jika tidak.
   */
  async deleteById(id) {
    const queryText =
      "DELETE FROM public.push_subscriptions WHERE id = $1 RETURNING id;";
    try {
      const result = await pool.query(queryText, [id]);
      return result.rowCount > 0;
    } catch (err) {
      console.error(
        `Error deleting push subscription with id ${id}:`,
        err.stack
      );
      throw err;
    }
  },

  /**
   * Mengambil semua langganan push yang aktif dan memilih untuk menerima notifikasi
   * untuk perangkat tertentu.
   * @param {string} deviceId - ID perangkat yang memicu alert.
   * @returns {Promise<Array>} Array objek langganan yang relevan.
   */
  async findAllSubscribersForDevice(deviceId) {
    const queryText = `
      SELECT ps.id AS push_subscription_db_id, ps.subscription_object 
      FROM public.push_subscriptions ps
      JOIN public.device_notification_preferences dnp ON ps.id = dnp.push_subscription_id
      WHERE dnp.device_id = $1;
    `;
    // Jika tidak ada preferensi (semua subscriber dapat notifikasi untuk semua device):
    // const queryText = 'SELECT id AS push_subscription_db_id, subscription_object FROM public.push_subscriptions';
    try {
      const result = await pool.query(queryText, [deviceId]);
      // Jika tidak ada preferensi, dan ingin kirim ke semua, hapus parameter [deviceId]
      return result.rows;
    } catch (err) {
      console.error(
        `Error finding subscribers for device ${deviceId}:`,
        err.stack
      );
      throw err;
    }
  },
};
