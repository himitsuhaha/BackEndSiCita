// src/controllers/user.controller.js
import { userService } from "../services/user.service.js";

export const userController = {
  /**
   * Admin: Mengambil daftar semua pengguna, dengan filter opsional.
   */
  async listAllUsers(req, res, next) {
    // ... (kode listAllUsers Anda tetap sama)
    try {
      const filters = req.query;
      const users = await userService.adminGetAllUsers(filters);
      res.status(200).json(users);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Admin: Mengambil detail satu pengguna berdasarkan ID.
   */
  async getUserById(req, res, next) {
    // ... (kode getUserById Anda tetap sama)
    try {
      const { userId } = req.params;
      const user = await userService.adminGetUserById(Number(userId));
      res.status(200).json(user);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Admin: Memperbarui detail pengguna (role, is_active, email, username).
   */
  async updateUser(req, res, next) {
    // ... (kode updateUser Anda tetap sama)
    try {
      const { userId } = req.params;
      const updateData = req.body;
      const updatedUser = await userService.adminUpdateUser(
        Number(userId),
        updateData
      );
      res.status(200).json({
        message: `Detail pengguna ${updatedUser.username} berhasil diperbarui.`,
        user: updatedUser,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Admin: Menghapus pengguna.
   */
  async deleteUser(req, res, next) {
    // ... (kode deleteUser Anda tetap sama)
    try {
      const { userId } = req.params;
      const requestingAdminId = req.user.id;
      const deletedUser = await userService.adminDeleteUser(
        requestingAdminId,
        Number(userId)
      );
      res.status(200).json({
        message: `Pengguna ${deletedUser.username} (ID: ${deletedUser.id}) berhasil dihapus.`,
        user: deletedUser,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Admin: Menyetujui registrasi pengguna.
   */
  async approveUser(req, res, next) {
    // ... (kode approveUser Anda tetap sama)
    try {
      const { userId } = req.params;
      const approvedUser = await userService.approveUserRegistration(
        Number(userId)
      );
      res.status(200).json({
        message: `Pengguna ${approvedUser.username} berhasil diaktifkan.`,
        user: approvedUser,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Admin: Mengambil daftar pengguna yang menunggu persetujuan.
   */
  async listPendingUsers(req, res, next) {
    // ... (kode listPendingUsers Anda tetap sama)
    try {
      const pendingUsers = await userService.listPendingUsers();
      res.status(200).json(pendingUsers);
    } catch (error) {
      next(error);
    }
  },

  // --- HANDLER BARU UNTUK PENGATURAN AKUN PENGGUNA (USER SENDIRI) ---

  /**
   * Pengguna yang terautentikasi memperbarui profilnya sendiri (misal, nama).
   */
  async updateMyProfile(req, res, next) {
    try {
      const userId = req.user.id; // ID pengguna diambil dari token JWT (setelah middleware authenticateJwt)
      const profileData = req.body; // Data yang diizinkan untuk diupdate (misal, { name: "Nama Baru" })

      // Validasi dasar untuk memastikan profileData tidak kosong, service akan validasi lebih lanjut
      if (Object.keys(profileData).length === 0) {
        // Menggunakan AppError jika Anda sudah mendefinisikannya di service atau utils
        const err = new Error(
          "Tidak ada data profil yang dikirim untuk diperbarui."
        );
        err.statusCode = 400;
        throw err;
      }

      const updatedUserProfile = await userService.updateMyProfile(
        userId,
        profileData
      );

      res.status(200).json({
        message: "Profil Anda berhasil diperbarui.",
        user: updatedUserProfile, // Mengirim kembali data user yang sudah terupdate (tanpa password hash)
      });
    } catch (error) {
      next(error);
    }
  },

  async adminCreateUser(req, res, next) {
    try {
      const userDataFromRequest = req.body;
      // Pastikan semua field yang diperlukan ada, service akan validasi lebih detail
      const { username, email, password, role, is_active } =
        userDataFromRequest;
      if (
        !username ||
        !email ||
        !password ||
        !role ||
        is_active === undefined
      ) {
        // Menggunakan Error standar atau AppError jika sudah diimpor/didefinisikan di sini
        const err = new Error(
          "Field username, email, password, role, dan is_active wajib diisi."
        );
        err.statusCode = 400;
        throw err;
      }

      const newUser = await userService.adminCreateUser(userDataFromRequest);

      // Anda bisa emit event socket.io di sini jika perlu
      // import { io } from "../app.js"; // Jika io diimpor
      // io.emit("user_created_by_admin", newUser);

      res.status(201).json({
        // 201 Created
        message: `Pengguna ${newUser.username} berhasil dibuat oleh admin.`,
        user: newUser, // Mengembalikan data pengguna baru (tanpa password hash)
      });
    } catch (error) {
      next(error); // Error akan ditangani oleh global error handler
    }
  },

  /**
   * Pengguna yang terautentikasi mengubah kata sandinya sendiri.
   */
  async changeMyPassword(req, res, next) {
    try {
      const userId = req.user.id; // ID pengguna dari token JWT
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        const err = new Error(
          "Kata sandi saat ini dan kata sandi baru wajib diisi."
        );
        err.statusCode = 400;
        throw err;
      }

      const result = await userService.changeMyPassword(
        userId,
        currentPassword,
        newPassword
      );

      res.status(200).json({
        message: result.message, // Pesan sukses dari service
      });
    } catch (error) {
      next(error);
    }
  },
};
