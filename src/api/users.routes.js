// src/api/users.routes.js
import { Router } from "express";
import { userController } from "../controllers/user.controller.js";
import { authenticateJwt } from "../middlewares/auth.middleware.js";
import { authorizeRole } from "../middlewares/role.middleware.js"; // Pastikan middleware ini ada

const router = Router();

// Semua rute di bawah ini memerlukan login (autentikasi JWT)
router.use(authenticateJwt);

// --- RUTE UNTUK PENGGUNA MENGELOLA AKUNNYA SENDIRI ---
// Pengguna yang terautentikasi bisa mengakses rute ini

// POST /api/users/admin-create - Admin: Membuat pengguna baru
router.post(
  "/admin-create",
  authorizeRole(["admin"]),
  userController.adminCreateUser
);
// PATCH /api/users/me/profile - Pengguna memperbarui profilnya sendiri
router.patch("/me/profile", userController.updateMyProfile);

// POST /api/users/me/change-password - Pengguna mengubah kata sandinya sendiri
router.post("/me/change-password", userController.changeMyPassword);

// --- RUTE KHUSUS ADMIN ---
// Rute di bawah ini memerlukan peran 'admin' selain sudah terautentikasi

// GET /api/users - Admin: Mengambil daftar semua pengguna (dengan filter opsional via query)
router.get("/", authorizeRole(["admin"]), userController.listAllUsers);

// GET /api/users/pending-approval - Admin: Mengambil daftar pengguna yang menunggu persetujuan
router.get(
  "/pending-approval",
  authorizeRole(["admin"]),
  userController.listPendingUsers
);

// GET /api/users/:userId - Admin: Mengambil detail satu pengguna
router.get("/:userId", authorizeRole(["admin"]), userController.getUserById);

// PATCH /api/users/:userId - Admin: Memperbarui detail pengguna (role, is_active, dll.)
router.patch("/:userId", authorizeRole(["admin"]), userController.updateUser);

// PATCH /api/users/:userId/approve - Admin: Menyetujui (mengaktifkan) pengguna
router.patch(
  "/:userId/approve",
  authorizeRole(["admin"]),
  userController.approveUser
);

// DELETE /api/users/:userId - Admin: Menghapus pengguna
router.delete("/:userId", authorizeRole(["admin"]), userController.deleteUser);

export default router;
