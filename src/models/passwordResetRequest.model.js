// src/models/passwordResetRequest.model.js
import { pool } from "../config/database.config.js";

export const passwordResetRequestModel = {
  /**
   * Membuat entri permintaan reset password baru. Status default 'pending'.
   */
  async create(userId, tokenHash, expiresAt) {
    const queryText = `
      INSERT INTO public.password_reset_requests 
        (user_id, token_hash, expires_at, status)
      VALUES ($1, $2, $3, 'pending') 
      RETURNING id, user_id, token_hash, status, expires_at, created_at; -- << PERBAIKAN DI SINI
    `;
    try {
      const result = await pool.query(queryText, [
        userId,
        tokenHash,
        expiresAt,
      ]);
      return result.rows[0];
    } catch (err) {
      console.error("Error creating password reset request:", err.stack);
      throw err;
    }
  },

  /**
   * Mencari permintaan reset berdasarkan hash token yang statusnya 'pending' dan belum kedaluwarsa.
   * Bergabung dengan tabel users untuk mendapatkan email pengguna.
   */
  async findValidRequestByTokenHash(tokenHash, client = pool) {
    // Tambahkan client opsional
    const queryText = `
      SELECT 
        prr.id, 
        prr.user_id, 
        u.email as user_email, -- Ambil email pengguna untuk konfirmasi/logging
        u.is_active as user_is_active, -- Ambil status aktif pengguna
        prr.token_hash, 
        prr.status, 
        prr.expires_at
      FROM public.password_reset_requests prr
      JOIN public.users u ON prr.user_id = u.id
      WHERE prr.token_hash = $1 AND prr.status = 'pending' AND prr.expires_at > NOW();
    `;
    try {
      const result = await client.query(queryText, [tokenHash]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
      console.error(
        "Error finding valid password reset request by token hash:",
        err.stack
      );
      throw err;
    }
  },

  /**
   * Menandai permintaan reset sebagai 'completed'.
   */
  async markAsCompleted(requestId, client = pool) {
    // Tambahkan client opsional
    const queryText = `
      UPDATE public.password_reset_requests
      SET status = 'completed'
      WHERE id = $1 AND status = 'pending' -- Hanya update yang masih pending
      RETURNING id, status;
    `;
    try {
      const result = await client.query(queryText, [requestId]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
      console.error(
        `Error marking password reset request ${requestId} as completed:`,
        err.stack
      );
      throw err;
    }
  },

  /**
   * Mencari permintaan reset yang pending atau sudah disetujui admin berdasarkan user ID.
   * Berguna untuk mencegah multiple active requests dari user yang sama.
   * @param {number} userId - ID pengguna.
   * @returns {Promise<Object|null>} Objek permintaan reset aktif jika ditemukan.
   */
  async findActiveRequestByUserId(userId, client = pool) {
    const queryText = `
      SELECT id, status, expires_at, created_at -- Ditambahkan created_at untuk konsistensi jika perlu
      FROM public.password_reset_requests
      WHERE user_id = $1 AND status = 'pending' AND expires_at > NOW();
    `;
    try {
      const result = await client.query(queryText, [userId]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
      console.error(
        "Error finding active password reset request by user ID:",
        err.stack
      );
      throw err;
    }
  },

  /**
   * Memperbarui status permintaan reset password.
   * @param {number} requestId - ID permintaan reset.
   * @param {string} status - Status baru.
   * @param {number|null} [adminIdApprover=null] - ID admin yang menyetujui (jika statusnya 'approved...').
   * @returns {Promise<Object|null>} Objek permintaan reset yang diperbarui atau null jika tidak ditemukan.
   */
  async updateStatus(requestId, status, adminIdApprover = null) {
    let queryText;
    const values = [];
    let valueCount = 1;

    const setClauses = [`status = $${valueCount++}`];
    values.push(status);

    if (status.startsWith("approved") && adminIdApprover) {
      setClauses.push(`admin_approved_at = NOW()`);
      setClauses.push(`admin_id_approver = $${valueCount++}`);
      values.push(adminIdApprover);
    }

    queryText = `
      UPDATE public.password_reset_requests
      SET ${setClauses.join(", ")}
      WHERE id = $${valueCount++}
      RETURNING id, user_id, status, expires_at, admin_approved_at;
    `;
    values.push(requestId);

    try {
      const result = await pool.query(queryText, values);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
      console.error(
        `Error updating status for password reset request ${requestId}:`,
        err.stack
      );
      throw err;
    }
  },

  /**
   * Menghapus permintaan reset password berdasarkan ID (misalnya setelah selesai atau kedaluwarsa).
   * @param {number} requestId - ID permintaan reset.
   * @returns {Promise<boolean>} True jika berhasil dihapus.
   */
  async deleteById(requestId) {
    const queryText =
      "DELETE FROM public.password_reset_requests WHERE id = $1;";
    try {
      const result = await pool.query(queryText, [requestId]);
      return result.rowCount > 0;
    } catch (err) {
      console.error(
        `Error deleting password reset request ${requestId}:`,
        err.stack
      );
      throw err;
    }
  },
  // Fungsi untuk mengambil semua request yang pending_admin_approval akan ditambahkan nanti saat membuat API admin
};
