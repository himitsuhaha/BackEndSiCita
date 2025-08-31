// src/middlewares/auth.middleware.js
import passport from "passport";

/**
 * Middleware untuk mengautentikasi menggunakan strategi JWT.
 * Tidak menggunakan sesi.
 * Jika token valid, req.user akan diisi dengan data pengguna dari token.
 * Jika token tidak valid atau tidak ada, akan mengirim respons 401 Unauthorized.
 */
export const authenticateJwt = (req, res, next) => {
  passport.authenticate("jwt", { session: false }, (err, user, info) => {
    if (err) {
      return next(err); // Teruskan error sistem ke error handler global
    }
    if (!user) {
      // Jika user tidak ditemukan (token tidak valid, user tidak ada, dll.)
      // info mungkin berisi detail seperti 'No auth token', 'jwt expired'
      const message =
        info && info.message
          ? info.message
          : "Akses ditolak: Token tidak valid atau tidak ada.";
      return res.status(401).json({ message: message });
    }
    // Jika autentikasi berhasil, tempelkan user ke object request
    req.user = user;
    return next(); // Lanjutkan ke handler rute berikutnya
  })(req, res, next); // Panggil middleware yang dikembalikan oleh passport.authenticate
};

// Nanti bisa ditambahkan middleware untuk otorisasi berdasarkan role
// export const authorizeRole = (roles) => (req, res, next) => { ... }
