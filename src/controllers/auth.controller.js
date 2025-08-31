// src/controllers/auth.controller.js
import { authService } from "../services/auth.service.js";

export const authController = {
  /**
   * Menangani registrasi pengguna baru.
   */
  async registerUser(req, res, next) {
    try {
      const { username, email, password } = req.body;
      // Validasi dasar input (bisa juga menggunakan library validasi seperti Joi atau express-validator di route)
      if (!username || !email || !password) {
        return res
          .status(400)
          .json({ message: "Username, email, dan password diperlukan." });
      }

      const newUser = await authService.register({ username, email, password });
      res.status(201).json({
        message: "Pengguna berhasil diregistrasi.",
        user: newUser, // Berisi id, username, email, role, created_at, updated_at
      });
    } catch (error) {
      next(error); // Teruskan error ke global error handler (akan menangani AuthError dari service)
    }
  },

  /**
   * Menangani login pengguna.
   */
  async loginUser(req, res, next) {
    try {
      const { emailOrUsername, password } = req.body;
      if (!emailOrUsername || !password) {
        return res
          .status(400)
          .json({ message: "Email/Username dan password diperlukan." });
      }

      const { user, token } = await authService.login({
        emailOrUsername,
        password,
      });
      res.status(200).json({
        message: "Login berhasil.",
        user: user, // Berisi id, username, email, role
        token: token, // JWT
      });
    } catch (error) {
      next(error);
    }
  },

  async handleOAuthLogin(req, res, next) {
    try {
      // Data yang dikirim dari NextAuth.js callback jwt akan ada di req.body
      // Misalnya: { email, name, provider (misal 'google'), providerAccountId (sub dari Google JWT), image }
      const oauthProfile = req.body;

      if (
        !oauthProfile ||
        !oauthProfile.provider ||
        !oauthProfile.providerAccountId ||
        !oauthProfile.email
      ) {
        return res
          .status(400)
          .json({ message: "Data profil OAuth tidak lengkap." });
      }

      const { user, token } = await authService.handleOAuthUser(oauthProfile);

      res.status(200).json({
        message: `Login/Registrasi dengan ${oauthProfile.provider} berhasil.`,
        user,
        token, // JWT backend kita
      });
    } catch (error) {
      next(error);
    }
  },

  async handleRequestPasswordReset(req, res, next) {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: "Email diperlukan." });
      }
      const result = await authService.requestPasswordReset(email);
      res.status(200).json(result); // Mengembalikan pesan dari service
    } catch (error) {
      next(error);
    }
  },

  async handleResetPasswordWithToken(req, res, next) {
    try {
      const { token, newPassword } = req.body;
      // Validasi dasar di sini, service akan melakukan validasi lebih lanjut
      if (!token || !newPassword) {
        return res
          .status(400)
          .json({ message: "Token dan password baru diperlukan." });
      }
      const result = await authService.resetPasswordWithToken(
        token,
        newPassword
      );
      res.status(200).json(result); // Mengembalikan pesan sukses dari service
    } catch (error) {
      next(error);
    }
  },
  /**
   * Menangani login dari klien mobile (Android/iOS) menggunakan Google ID Token.
   */
  async handleMobileOAuthLogin(req, res, next) {
    try {
      const { idToken } = req.body;
      if (!idToken) {
        return res.status(400).json({ message: "Google ID Token diperlukan." });
      }

      // Delegasikan verifikasi token dan proses login ke service layer
      const { user, token } = await authService.verifyGoogleTokenAndLogin(
        idToken
      );

      res.status(200).json({
        message: "Login dengan Google berhasil.",
        user,
        token,
      });
    } catch (error) {
      next(error); // Teruskan error ke global error handler
    }
  },
};
