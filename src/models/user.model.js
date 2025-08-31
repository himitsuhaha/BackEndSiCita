// src/models/user.model.js
import { pool } from "../config/database.config.js";
import argon2 from "argon2";

export const userModel = {
  // ... (fungsi create, findByEmail, findByIdWithPassword, dll. Anda yang sudah ada tetap sama) ...
  async create(userData) {
    const {
      username,
      email,
      password,
      role = "user",
      provider = "credentials",
      providerAccountId = null,
      is_active = provider !== "credentials",
    } = userData;
    let passwordHash = null;
    if (provider === "credentials") {
      if (!password)
        throw new Error(
          "Password is required for credentials-based user creation."
        );
      passwordHash = await argon2.hash(password);
    }
    const queryText = `
      INSERT INTO public.users (username, email, password_hash, role, provider, provider_account_id, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, username, email, role, created_at, updated_at, is_active, provider, provider_account_id;
    `;
    try {
      const result = await pool.query(queryText, [
        username,
        email,
        passwordHash,
        role,
        provider,
        providerAccountId,
        is_active,
      ]);
      return result.rows[0];
    } catch (err) {
      if (err.code === "23505") {
        if (err.constraint === "users_username_key")
          throw new Error("Username already exists.");
        if (err.constraint === "users_email_key")
          throw new Error("Email already exists (for credentials provider).");
        if (err.constraint === "unique_provider_account")
          throw new Error(`This ${provider} account is already linked.`);
        throw new Error(
          `User creation failed due to unique constraint: ${
            err.detail || err.message
          }`
        );
      }
      console.error("Error creating user:", err.stack);
      throw err;
    }
  },

  async findByEmail(email) {
    const queryText = "SELECT * FROM public.users WHERE email = $1";
    try {
      const result = await pool.query(queryText, [email]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
      console.error(
        `Error finding user by email ${email} (with password):`,
        err.stack
      );
      throw err;
    }
  },

  async findByIdWithPassword(id) {
    const queryText = "SELECT * FROM public.users WHERE id = $1";
    try {
      const result = await pool.query(queryText, [id]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
      console.error(
        `Error finding user by id ${id} (with password):`,
        err.stack
      );
      throw err;
    }
  },

  async findByProviderAccountId(provider, providerAccountId) {
    const queryText =
      "SELECT * FROM public.users WHERE provider = $1 AND provider_account_id = $2";
    try {
      const result = await pool.query(queryText, [provider, providerAccountId]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
      console.error(
        `Error finding user by provider ${provider} and account ID ${providerAccountId}:`,
        err.stack
      );
      throw err;
    }
  },

  async linkOAuthAccount(userId, provider, providerAccountId) {
    const queryText = `
      UPDATE public.users 
      SET provider = $1, provider_account_id = $2, updated_at = NOW(), is_active = TRUE 
      WHERE id = $3 AND provider_account_id IS NULL
      RETURNING id, username, email, role, created_at, updated_at, is_active, provider, provider_account_id;
    `;
    try {
      const result = await pool.query(queryText, [
        provider,
        providerAccountId,
        userId,
      ]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
      if (
        err.code === "23505" &&
        err.constraint === "unique_provider_account"
      ) {
        throw new Error(
          `This ${provider} account is already linked to another user.`
        );
      }
      console.error(
        `Error linking OAuth account for user ${userId}:`,
        err.stack
      );
      throw err;
    }
  },

  async findByUsername(username) {
    const queryText = "SELECT * FROM public.users WHERE username = $1";
    try {
      const result = await pool.query(queryText, [username]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
      console.error(`Error finding user by username ${username}:`, err.stack);
      throw err;
    }
  },

  async verifyPassword(plainPassword, hashedPassword) {
    try {
      return await argon2.verify(hashedPassword, plainPassword);
    } catch (err) {
      console.error("Error verifying password:", err);
      return false;
    }
  },

  async findById(id) {
    const queryText =
      "SELECT id, username, email, role, is_active, provider, provider_account_id, created_at, updated_at, password_changed_at FROM public.users WHERE id = $1";
    try {
      const result = await pool.query(queryText, [id]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
      console.error(`Error finding user by id ${id}:`, err.stack);
      throw err;
    }
  },

  /**
   * Memperbarui profil pengguna (hanya field username oleh pengguna sendiri).
   * @param {number} userId - ID pengguna yang akan diperbarui.
   * @param {Object} profileData - Objek berisi { username: "Username Baru" }.
   * @returns {Promise<Object|null>} Objek pengguna yang sudah diperbarui (tanpa password_hash).
   */
  async updateProfile(userId, profileData) {
    const { username } = profileData;

    if (username === undefined) {
      console.warn(
        `Attempt to update profile for user ${userId} without 'username' field.`
      );
      // Kembalikan data user saat ini jika tidak ada field username yang dikirim untuk diupdate
      // Atau bisa juga throw error jika 'username' dianggap wajib ada di payload profileData
      return this.findById(userId);
    }

    const queryText = `
      UPDATE public.users
      SET username = $1, updated_at = NOW() 
      WHERE id = $2
      RETURNING id, username, email, role, is_active, provider, provider_account_id, created_at, updated_at; 
    `;
    try {
      const result = await pool.query(queryText, [username, userId]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
      // Tangani error jika username sudah ada (jika ada unique constraint di username)
      if (err.code === "23505" && err.constraint === "users_username_key") {
        // Buat error spesifik yang akan ditangkap service/controller
        const appError = new Error(`Username '${username}' sudah digunakan.`);
        appError.statusCode = 409; // Status Conflict
        throw appError;
      }
      console.error(
        `Error updating profile (username) for user ${userId}:`,
        err.stack
      );
      throw err;
    }
  },

  async setActiveStatus(userId, isActive) {
    // ... (kode Anda tetap sama) ...
    const queryText = `
      UPDATE public.users
      SET is_active = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, username, email, role, is_active, created_at, updated_at;
    `;
    try {
      const result = await pool.query(queryText, [isActive, userId]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
      console.error(
        `Error updating active status for user ${userId} to ${isActive}:`,
        err.stack
      );
      throw err;
    }
  },

  async findPendingApproval() {
    // ... (kode Anda tetap sama) ...
    const queryText =
      "SELECT id, username, email, role, created_at, is_active FROM public.users WHERE is_active = FALSE ORDER BY created_at ASC";
    try {
      const result = await pool.query(queryText);
      return result.rows;
    } catch (err) {
      console.error(`Error finding pending approval users:`, err.stack);
      throw err;
    }
  },

  async findAll(filters = {}) {
    // ... (kode Anda tetap sama) ...
    let queryText =
      "SELECT id, username, email, role, is_active, provider, provider_account_id, created_at, updated_at FROM public.users";
    const values = [];
    const conditions = [];
    let valueCount = 1;

    if (filters && "is_active" in filters && filters.is_active !== undefined) {
      conditions.push(`is_active = $${valueCount++}`);
      const isActiveBoolean =
        String(filters.is_active).toLowerCase() === "true";
      values.push(isActiveBoolean);
    }
    if (
      filters &&
      "role" in filters &&
      filters.role !== undefined &&
      String(filters.role).trim() !== ""
    ) {
      conditions.push(`role = $${valueCount++}`);
      values.push(String(filters.role).trim());
    }
    if (conditions.length > 0) {
      queryText += " WHERE " + conditions.join(" AND ");
    }
    queryText += " ORDER BY created_at DESC;";
    try {
      const result = await pool.query(queryText, values);
      return result.rows;
    } catch (err) {
      console.error("Error finding all users with filters:", err.stack);
      throw err;
    }
  },

  async update(userId, fieldsToUpdate) {
    // ... (kode Anda tetap sama, pastikan 'username' ada di allowedUpdateFields jika admin boleh mengubahnya) ...
    const setClauses = [];
    const values = [];
    let valueCount = 1;
    // Pastikan 'username' termasuk di sini jika admin bisa mengubah username pengguna lain
    const allowedUpdateFields = ["username", "email", "role", "is_active"];

    for (const key in fieldsToUpdate) {
      if (
        allowedUpdateFields.includes(key) &&
        Object.prototype.hasOwnProperty.call(fieldsToUpdate, key)
      ) {
        // Perbaikan hasOwnProperty
        setClauses.push(`${key} = $${valueCount++}`);
        values.push(fieldsToUpdate[key]);
      }
    }
    if (setClauses.length === 0) {
      console.warn(`No valid fields to update provided for user ${userId}.`);
      return this.findById(userId);
    }
    setClauses.push(`updated_at = NOW()`);
    values.push(userId);
    const queryText = `
      UPDATE public.users 
      SET ${setClauses.join(", ")} 
      WHERE id = $${valueCount}
      RETURNING id, username, email, role, is_active, created_at, updated_at;
    `;
    try {
      const result = await pool.query(queryText, values);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
      if (err.code === "23505") {
        // Menangani error duplikasi untuk username atau email
        const constraint = err.constraint;
        if (constraint === "users_username_key") {
          throw new Error(
            `Update failed: Username '${fieldsToUpdate.username}' sudah digunakan.`
          );
        } else if (constraint === "users_email_key") {
          throw new Error(
            `Update failed: Email '${fieldsToUpdate.email}' sudah digunakan.`
          );
        }
        throw new Error(
          `Update failed: Nilai duplikat pada ${constraint}. ${
            err.detail || ""
          }`
        );
      }
      console.error(`Error updating user ${userId}:`, err.stack);
      throw err;
    }
  },

  async deleteById(userId) {
    // ... (kode Anda tetap sama) ...
    const queryText =
      "DELETE FROM public.users WHERE id = $1 RETURNING id, username, email;";
    try {
      const result = await pool.query(queryText, [userId]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
      console.error(`Error deleting user ${userId}:`, err.stack);
      throw err;
    }
  },

  async updatePassword(userId, newPasswordHash, client = pool) {
    const queryText = `
      UPDATE public.users
      SET password_hash = $1, 
          updated_at = NOW(),
          password_changed_at = NOW()
      WHERE id = $2
      RETURNING id, username, email, role, is_active; 
    `;
    try {
      const result = await client.query(queryText, [newPasswordHash, userId]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
      console.error(`Error updating password for user ${userId}:`, err.stack);
      throw err;
    }
  },
};