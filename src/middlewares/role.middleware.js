// src/middlewares/role.middleware.js

/**
 * Middleware untuk otorisasi berdasarkan peran pengguna.
 * Memastikan req.user ada (dari authenticateJwt) dan req.user.role termasuk dalam allowedRoles.
 * @param {Array<string>} allowedRoles - Array string peran yang diizinkan (e.g., ['admin'], ['admin', 'moderator']).
 */
export const authorizeRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      // Ini seharusnya tidak terjadi jika authenticateJwt berjalan dengan benar
      console.warn(
        "[Authorize Role] req.user atau req.user.role tidak ditemukan. Pastikan authenticateJwt dijalankan sebelumnya."
      );
      return res
        .status(403)
        .json({ message: "Akses ditolak: Informasi pengguna tidak lengkap." });
    }

    if (!allowedRoles.includes(req.user.role)) {
      console.warn(
        `[Authorize Role] Akses ditolak untuk role: ${
          req.user.role
        }. Role yang diizinkan: ${allowedRoles.join(", ")}`
      );
      return res
        .status(403)
        .json({
          message: "Akses ditolak: Anda tidak memiliki izin yang cukup.",
        });
    }

    // Jika peran diizinkan, lanjutkan ke handler berikutnya
    next();
  };
};
