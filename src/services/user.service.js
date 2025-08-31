// src/services/user.service.js
import { userModel } from "../models/user.model.js";
import argon2 from "argon2";

// Helper untuk membuat error kustom dengan status code (Definisi AppError Anda)
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const userService = {
  // ... (Fungsi approveUserRegistration, listPendingUsers, getAllUsers, getUserDetails,
  // adminGetAllUsers, adminGetUserById, adminUpdateUser, adminDeleteUser Anda tetap sama) ...
  // Pastikan AppError digunakan secara konsisten di fungsi-fungsi tersebut.

  async approveUserRegistration(userIdToApprove) {
    if (!userIdToApprove || isNaN(parseInt(String(userIdToApprove)))) {
      throw new AppError("User ID tidak valid untuk persetujuan.", 400);
    }
    const user = await userModel.findById(userIdToApprove); // findById sudah tidak mengambil password_hash
    if (!user) {
      throw new AppError("Pengguna yang akan disetujui tidak ditemukan.", 404);
    }
    if (user.is_active) {
      console.log(`[User Service] Pengguna ${userIdToApprove} sudah aktif.`);
      return user; // Kembalikan data pengguna yang sudah aktif (tanpa password_hash)
    }
    // Menggunakan userModel.update untuk mengaktifkan user.
    // Pastikan userModel.update bisa hanya menerima { is_active: true }
    const updatedUser = await userModel.update(userIdToApprove, {
      is_active: true,
    });
    if (!updatedUser) throw new AppError("Gagal mengaktifkan pengguna.", 500);
    return updatedUser; // Model update sudah mengembalikan data tanpa password_hash
  },

  async adminCreateUser(userDataByAdmin) {
    const {
      username,
      email,
      password,
      role,
      is_active = true,
    } = userDataByAdmin; // is_active default true jika dibuat admin

    // Validasi input dasar
    if (!username || username.trim().length < 3) {
      throw new AppError("Username minimal 3 karakter.", 400);
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      throw new AppError(
        "Username hanya boleh berisi huruf, angka, dan underscore (_).",
        400
      );
    }
    if (!email || !email.includes("@")) {
      // Validasi email sederhana
      throw new AppError("Format email tidak valid.", 400);
    }
    if (!password || password.length < 6) {
      throw new AppError("Password minimal 6 karakter.", 400);
    }
    const validRoles = ["user", "admin"];
    if (!role || !validRoles.includes(role)) {
      throw new AppError(
        `Peran tidak valid. Pilih dari: ${validRoles.join(", ")}.`,
        400
      );
    }
    if (typeof is_active !== "boolean") {
      throw new AppError("Status is_active harus boolean (true/false).", 400);
    }

    // Data yang akan dikirim ke model.create
    // Model create sudah menghandle hashing password jika provider 'credentials' dan password ada.
    const userDataForModel = {
      username: username.trim(),
      email: email.trim(),
      password: password, // Kirim password plain text, model akan hash
      role: role,
      provider: "credentials", // Pengguna yang dibuat admin adalah credentials
      providerAccountId: null,
      is_active: is_active, // Gunakan status aktif dari input admin
    };

    try {
      // userModel.create akan menangani hashing password dan error unique constraint
      const newUser = await userModel.create(userDataForModel);

      // Hapus password_hash dari objek yang dikembalikan (meskipun model.create sudah melakukannya)
      const { password_hash, ...userResult } = newUser;
      return userResult;
    } catch (error) {
      // Jika error sudah AppError dari model (misalnya, unique constraint), lempar lagi
      if (error.statusCode) throw error;
      // Untuk error database lainnya
      console.error("Service error creating user via admin:", error);
      throw new AppError("Gagal membuat pengguna baru di database.", 500);
    }
  },

  async listPendingUsers() {
    return await userModel.findPendingApproval();
  },

  async getAllUsers(filters = {}) {
    return await userModel.findPendingApproval(); // Seperti di kode Anda
  },

  async getUserDetails(userId) {
    const user = await userModel.findById(userId);
    if (!user) {
      throw new AppError("Pengguna tidak ditemukan.", 404);
    }
    return user; // findById sudah tidak mengambil password_hash
  },

  async adminGetAllUsers(filters = {}) {
    const users = await userModel.findAll(filters);
    // findAll di model sudah tidak mengembalikan password_hash
    return users;
  },

  async adminGetUserById(userId) {
    const user = await userModel.findById(userId);
    if (!user) {
      throw new AppError("Pengguna tidak ditemukan.", 404);
    }
    return user; // findById sudah tidak mengambil password_hash
  },

  async adminUpdateUser(targetUserId, updateData) {
    const { role, is_active, email, username } = updateData;
    const fieldsToUpdate = {};

    // Bagian validasi input Anda sudah bagus, biarkan seperti ini
    if (username !== undefined) {
      if (typeof username !== "string" || username.trim().length < 3)
        throw new AppError("Username minimal 3 karakter.", 400);
      if (!/^[a-zA-Z0-9_]+$/.test(username.trim()))
        throw new AppError("Format username tidak valid.", 400);
      fieldsToUpdate.username = username.trim();
    }
    if (email !== undefined) {
      if (typeof email !== "string" || !email.includes("@"))
        throw new AppError("Format email tidak valid.", 400);
      fieldsToUpdate.email = email.trim();
    }
    if (role !== undefined) {
      const validRoles = ["user", "admin"];
      if (!validRoles.includes(role))
        throw new AppError(`Peran tidak valid: ${role}.`, 400);
      fieldsToUpdate.role = role;
    }
    if (is_active !== undefined) {
      if (typeof is_active !== "boolean")
        throw new AppError("Status is_active harus boolean.", 400);
      fieldsToUpdate.is_active = is_active;
    }

    if (Object.keys(fieldsToUpdate).length === 0) {
      const currentUser = await userModel.findById(targetUserId);
      if (!currentUser)
        throw new AppError("Pengguna yang akan diupdate tidak ditemukan.", 404);
      return currentUser;
    }

    const userToUpdate = await userModel.findById(targetUserId);
    if (!userToUpdate)
      throw new AppError("Pengguna yang akan diupdate tidak ditemukan.", 404);

    // ▼▼▼ PENGECEKAN 1: MENCEGAH ADMIN MENGUBAH EMAIL SESAMA ADMIN ▼▼▼
    if (fieldsToUpdate.email && userToUpdate.role === "admin") {
      throw new AppError("Admin tidak dapat mengubah email sesama admin.", 403); // 403 Forbidden
    }

    // ▼▼▼ PENGECEKAN 2 (BONUS): MEMASTIKAN EMAIL BARU BELUM DIGUNAKAN ▼▼▼
    if (fieldsToUpdate.email) {
      const existingUser = await userModel.findByEmail(fieldsToUpdate.email);
      if (existingUser && String(existingUser.id) !== String(targetUserId)) {
        throw new AppError(
          `Email '${fieldsToUpdate.email}' sudah digunakan oleh pengguna lain.`,
          409
        ); // 409 Conflict
      }
    }

    // Pengecekan admin terakhir Anda tetap di sini (ini sudah bagus)
    if (
      userToUpdate.role === "admin" &&
      fieldsToUpdate.role &&
      fieldsToUpdate.role !== "admin"
    ) {
      const adminCountResult = await userModel.pool.query(
        "SELECT COUNT(*) FROM public.users WHERE role = 'admin'"
      );
      const adminCount = parseInt(adminCountResult.rows[0].count, 10);
      if (adminCount <= 1)
        throw new AppError("Tidak dapat mengubah peran admin terakhir.", 400);
    }

    const updatedUser = await userModel.update(targetUserId, fieldsToUpdate);
    if (!updatedUser)
      throw new AppError(
        "Gagal memperbarui pengguna atau pengguna tidak ditemukan.",
        404
      );
    return updatedUser;
  },

  async adminDeleteUser(requestingAdminId, targetUserId) {
    if (Number(requestingAdminId) === Number(targetUserId)) {
      throw new AppError("Admin tidak dapat menghapus akunnya sendiri.", 400);
    }
    const userToDelete = await userModel.findById(targetUserId);
    if (!userToDelete)
      throw new AppError("Pengguna yang akan dihapus tidak ditemukan.", 404);
    // Pengecekan hanya berlaku jika admin yang akan dihapus adalah admin yang AKTIF.
    if (userToDelete.role === "admin" && userToDelete.is_active) {
      // Query sekarang hanya menghitung admin yang aktif.
      const adminCountResult = await userModel.pool.query(
        "SELECT COUNT(*) FROM public.users WHERE role = 'admin' AND is_active = TRUE"
      );
      const adminCount = parseInt(adminCountResult.rows[0].count, 10);

      if (adminCount <= 1)
        throw new AppError(
          "Tidak dapat menghapus akun admin aktif terakhir.",
          400
        );
    }
    const deletedUser = await userModel.deleteById(targetUserId);
    if (!deletedUser)
      throw new AppError(
        "Gagal menghapus pengguna atau pengguna tidak ditemukan.",
        404
      );
    return deletedUser;
  },

  // --- FUNGSI UNTUK PENGATURAN AKUN PENGGUNA (DISESUAIKAN UNTUK USERNAME) ---

  async updateMyProfile(userId, profileData) {
    const { username } = profileData; // Mengharapkan 'username' dari frontend

    if (
      username === undefined ||
      typeof username !== "string" ||
      username.trim().length < 3
    ) {
      throw new AppError("Username tidak valid atau minimal 3 karakter.", 400);
    }
    // Validasi format username (contoh: hanya alfanumerik dan underscore)
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      throw new AppError(
        "Username hanya boleh berisi huruf, angka, dan underscore (_).",
        400
      );
    }

    const dataToUpdate = { username: username.trim() };

    // Cek apakah username baru sudah digunakan oleh user lain (jika username unique)
    const existingUserWithNewUsername = await userModel.findByUsername(
      dataToUpdate.username
    );
    if (
      existingUserWithNewUsername &&
      existingUserWithNewUsername.id !== userId
    ) {
      throw new AppError(
        `Username '${dataToUpdate.username}' sudah digunakan oleh pengguna lain.`,
        409
      ); // 409 Conflict
    }

    const updatedUser = await userModel.updateProfile(userId, dataToUpdate);
    if (!updatedUser) {
      throw new AppError(
        "Gagal memperbarui profil atau pengguna tidak ditemukan.",
        404
      );
    }
    // Model updateProfile sudah mengembalikan data tanpa password_hash
    return updatedUser;
  },

  async changeMyPassword(userId, currentPassword, newPassword) {
    // ... (Fungsi changeMyPassword Anda yang sudah ada sebelumnya sudah baik, pastikan ia menggunakan
    //      userModel.findByIdWithPassword(userId) dan userModel.verifyPassword(), lalu userModel.updatePassword()) ...
    if (!currentPassword || !newPassword) {
      throw new AppError(
        "Kata sandi saat ini dan kata sandi baru wajib diisi.",
        400
      );
    }
    if (newPassword.length < 6) {
      throw new AppError("Kata sandi baru minimal 6 karakter.", 400);
    }
    const user = await userModel.findByIdWithPassword(userId);
    if (!user) {
      throw new AppError("Pengguna tidak ditemukan.", 404);
    }
    if (!user.password_hash) {
      throw new AppError(
        "Tidak dapat mengubah kata sandi untuk akun yang terdaftar melalui OAuth.",
        400
      );
    }
    const isPasswordCorrect = await userModel.verifyPassword(
      currentPassword,
      user.password_hash
    );
    if (!isPasswordCorrect) {
      throw new AppError("Kata sandi saat ini salah.", 401);
    }
    const newPasswordHash = await argon2.hash(newPassword);
    const updatedUserResult = await userModel.updatePassword(
      userId,
      newPasswordHash
    );
    if (!updatedUserResult) {
      throw new AppError("Gagal memperbarui kata sandi.", 500);
    }
    return { message: "Kata sandi berhasil diubah." };
  },
};
