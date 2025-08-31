// src/config/passport.config.js
import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt";
import { JWT_SECRET } from "./server.config.js"; // Ambil JWT_SECRET dari konfigurasi server
import { userModel } from "../models/user.model.js"; // Untuk mencari pengguna berdasarkan ID dari payload token

const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), // Ekstrak token dari header 'Authorization: Bearer <token>'
  secretOrKey: JWT_SECRET, // Kunci rahasia untuk memverifikasi tanda tangan token
  // algorithms: ['HS256'] // Opsional: tentukan algoritma jika perlu
};

export const configureJwtStrategy = (passport) => {
  passport.use(
    new JwtStrategy(jwtOptions, async (jwt_payload, done) => {
      // jwt_payload adalah token yang sudah di-decode dan diverifikasi
      // Biasanya berisi id pengguna, username, dll. yang kita masukkan saat membuat token
      console.log("[JWT Strategy] Payload diterima:", jwt_payload);
      try {
        // Cari pengguna di database berdasarkan ID dari payload token
        // findById sekarang mengambil 'password_changed_at' juga
        const user = await userModel.findById(jwt_payload.id);

        if (user) {
          // --- LOGIKA BARU UNTUK MEMVALIDASI TOKEN SETELAH GANTI PASSWORD ---
          if (user.password_changed_at) {
            // 'iat' (issued at) di payload JWT adalah dalam format Unix timestamp (detik)
            const tokenIssuedAt = new Date(jwt_payload.iat * 1000);
            
            // Bandingkan waktu token dibuat dengan waktu password terakhir diubah
            if (tokenIssuedAt < user.password_changed_at) {
              // Jika token dibuat SEBELUM password diubah, maka token tidak valid
              return done(null, false, {
                message: "Sesi tidak valid karena kata sandi telah diubah.",
              });
            }
          }
          // --- AKHIR LOGIKA BARU ---

          // Jika pengguna ditemukan dan token masih valid, teruskan objek pengguna ke Passport
          // Passport akan menempelkannya ke req.user
          return done(null, user);
        } else {
          // Jika pengguna tidak ditemukan (misalnya, akun sudah dihapus setelah token dibuat)
          return done(null, false, {
            message: "User not found associated with this token.",
          });
        }
      } catch (error) {
        console.error("[JWT Strategy] Error:", error);
        return done(error, false);
      }
    })
  );
};