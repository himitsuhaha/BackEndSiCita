// src/services/auth.service.js
import { userModel } from "../models/user.model.js";
import { passwordResetRequestModel } from "../models/passwordResetRequest.model.js";
import { sendEmail } from "../utils/email.util.js";
import { FRONTEND_URL } from "../config/server.config.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../config/server.config.js";
import { pool } from "../config/database.config.js";
import argon2 from "argon2";
import { OAuth2Client } from "google-auth-library";
const googleClient = new OAuth2Client();

class AuthError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const authService = {
  // ... (fungsi lain seperti register, login, dll tetap sama) ...

  async register(userData) {
    const { username, email, password } = userData;
    if (!username || !email || !password) {
      throw new AuthError("Username, email, and password are required.", 400);
    }
    try {
      let existingUser = await userModel.findByEmail(email);
      if (existingUser) {
        throw new AuthError("Email already registered.", 409);
      }
      existingUser = await userModel.findByUsername(username);
      if (existingUser) {
        throw new AuthError("Username already taken.", 409);
      }
      const newUser = await userModel.create({
        username,
        email,
        password,
        role: "user",
      });
      const { password_hash, ...userWithoutPassword } = newUser;
      return userWithoutPassword;
    } catch (error) {
      if (error.message.includes("already exists")) {
        throw new AuthError(error.message, 409);
      }
      console.error("[AuthService] Error during registration:", error);
      throw new AuthError(
        error.message || "Registration failed due to an internal error.",
        500
      );
    }
  },

  async login(credentials) {
    const { emailOrUsername, password } = credentials;
    if (!emailOrUsername || !password) {
      throw new AuthError("Email/Username and password are required.", 400);
    }
    let user = await userModel.findByEmail(emailOrUsername);
    if (!user) {
      user = await userModel.findByUsername(emailOrUsername);
    }
    if (!user) {
      throw new AuthError(
        "Kredensial tidak valid. Pengguna tidak ditemukan.",
        401
      );
    }
    const isPasswordValid = await userModel.verifyPassword(
      password,
      user.password_hash
    );
    if (!isPasswordValid) {
      throw new AuthError("Kredensial tidak valid. Password salah.", 401);
    }
    if (!user.is_active) {
      throw new AuthError(
        "Akun Anda belum aktif atau sedang menunggu persetujuan admin. Silakan hubungi administrator.",
        403
      );
    }
    const payload = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      password_changed_at: (user.password_changed_at || user.created_at).getTime(),
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    const { password_hash, ...userWithoutPassword } = user;
    return { user: userWithoutPassword, token };
  },

  async verifyGoogleTokenAndLogin(idToken) {
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: idToken,
        audience: process.env.GOOGLE_ANDROID_CLIENT_ID,
      });
      const googlePayload = ticket.getPayload();
      const oauthProfile = {
        email: googlePayload.email,
        name: googlePayload.name,
        provider: "google",
        providerAccountId: googlePayload.sub,
        image: googlePayload.picture,
      };
      return this.handleOAuthUser(oauthProfile);
    } catch (error) {
      console.error(
        "[AuthService] Google ID Token verification failed:",
        error.message
      );
      throw new AuthError("Token Google tidak valid atau kedaluwarsa.", 401);
    }
  },

  async handleOAuthUser(oauthProfile) {
    const { email, name, provider, providerAccountId } = oauthProfile;
    if (!email || !provider || !providerAccountId) {
      throw new AuthError(
        "Data profil OAuth tidak lengkap (email, provider, providerAccountId diperlukan).",
        400
      );
    }
    try {
      let user = await userModel.findByProviderAccountId(
        provider,
        providerAccountId
      );
      if (!user) {
        const userByEmail = await userModel.findByEmail(email);
        if (userByEmail) {
          if (
            (userByEmail.provider === "credentials" ||
              userByEmail.provider === null) &&
            !userByEmail.provider_account_id
          ) {
            user = await userModel.linkOAuthAccount(
              userByEmail.id,
              provider,
              providerAccountId
            );
            if (!user) {
              throw new AuthError(
                `Gagal menautkan akun ${provider}. Email mungkin sudah tertaut dengan akun ${provider} lain atau ada konflik data.`,
                409
              );
            }
          } else {
            throw new AuthError(
              `Email ${email} sudah terdaftar dengan metode login atau akun ${provider} yang berbeda.`,
              409
            );
          }
        } else {
          throw new AuthError(
            `Akun Google Anda tidak terdaftar di sistem kami atau belum ditautkan. Silakan hubungi administrator atau daftar melalui metode lain jika tersedia.`,
            403
          );
        }
      }
      if (!user || !user.is_active) {
        throw new AuthError(
          "Login OAuth gagal: Pengguna tidak ditemukan atau tidak aktif.",
          401
        );
      }
      const payload = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        provider: user.provider,
        password_changed_at: (user.password_changed_at || user.created_at).getTime(),
      };
      const token = jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
      });
      const { password_hash, ...userWithoutPassword } = user;
      return { user: userWithoutPassword, token };
    } catch (error) {
      console.error(
        "[AuthService] Error during restricted OAuth user handling:",
        error
      );
      if (error instanceof AuthError) throw error;
      throw new AuthError(
        error.message ||
          "Penanganan login OAuth gagal karena kesalahan internal.",
        500
      );
    }
  },

  /**
   * Menangani permintaan reset password dari pengguna.
   * Email dikirim di latar belakang untuk mencegah timeout.
   */
  async requestPasswordReset(email) {
    if (!email || typeof email !== "string") {
      throw new AuthError("Email diperlukan.", 400);
    }

    const user = await userModel.findByEmail(email);
    if (!user || !user.is_active) {
      console.warn(
        `[PassReset] Attempt to reset password for non-existent or inactive email: ${email}`
      );
      return {
        message:
          "Jika email Anda terdaftar dan akun Anda aktif, instruksi reset password akan dikirimkan.",
      };
    }

    const existingRequest =
      await passwordResetRequestModel.findActiveRequestByUserId(user.id);
    if (existingRequest) {
      return {
        message:
          "Permintaan reset password untuk email ini baru saja dibuat. Silakan periksa email Anda.",
      };
    }

    const plainToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(plainToken)
      .digest("hex");
    const expiresAt = new Date(Date.now() + 3600000); // 1 jam

    await passwordResetRequestModel.create(
      user.id,
      tokenHash,
      expiresAt
    );

    const resetLink = `${FRONTEND_URL}/reset-password/${plainToken}`;

    // --- MODIFIKASI KUNCI DI SINI ---
    // Jalankan pengiriman email di latar belakang tanpa menunggu (fire-and-forget)
    (async () => {
      try {
        await sendEmail({
          to: user.email,
          subject: "Permintaan Reset Password Akun Anda",
          text: `Halo ${user.username},\n\nKlik link berikut untuk mereset password Anda:\n${resetLink}\n\nLink ini akan kedaluwarsa dalam 1 jam.\n\nTim Aplikasi Pemantauan Banjir`,
          html: `<p>Halo ${user.username},</p><p>Silakan klik link berikut untuk mereset password Anda:</p><p><a href="${resetLink}">${resetLink}</a></p><p>Link ini akan kedaluwarsa dalam 1 jam.</p><p>Tim Aplikasi Pemantauan Banjir</p>`,
        });
        console.log(`[PassReset] Email reset password untuk ${user.email} berhasil dimasukkan ke antrian pengiriman.`);
      } catch (emailError) {
        console.error(
          `[PassReset] Gagal mengirim email di latar belakang untuk ${user.email}:`,
          emailError
        );
      }
    })();
    // --- AKHIR MODIFIKASI ---

    // Langsung kembalikan respons sukses ke pengguna tanpa menunggu email terkirim
    return {
      message:
        "Jika email Anda terdaftar dan akun Anda aktif, email berisi instruksi untuk mereset password telah dikirimkan.",
    };
  },

  async resetPasswordWithToken(plainToken, newPassword) {
    if (!plainToken || !newPassword) {
      throw new AuthError("Token dan password baru diperlukan.", 400);
    }
    if (newPassword.length < 6) {
      throw new AuthError("Password baru minimal 6 karakter.", 400);
    }
    const tokenHash = crypto
      .createHash("sha256")
      .update(plainToken)
      .digest("hex");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const resetRequest =
        await passwordResetRequestModel.findValidRequestByTokenHash(
          tokenHash,
          client
        );
      if (!resetRequest) {
        throw new AuthError(
          "Token reset password tidak valid, sudah digunakan, atau kedaluwarsa.",
          400
        );
      }
      if (!resetRequest.user_is_active) {
        throw new AuthError(
          "Akun pengguna terkait token ini tidak aktif. Hubungi administrator.",
          403
        );
      }
      const userId = resetRequest.user_id;
      const user = await userModel.findByIdWithPassword(userId);
      if (!user || !user.password_hash) {
        throw new AuthError(
          "Pengguna tidak ditemukan atau tidak memiliki password kredensial.",
          404
        );
      }
      const isSameAsOldPassword = await userModel.verifyPassword(
        newPassword,
        user.password_hash
      );
      if (isSameAsOldPassword) {
        throw new AuthError(
          "Password baru tidak boleh sama dengan password lama Anda.",
          400
        );
      }
      const newPasswordHash = await argon2.hash(newPassword);
      await userModel.updatePassword(
        userId,
        newPasswordHash,
        client
      );
      await passwordResetRequestModel.markAsCompleted(
        resetRequest.id,
        client
      );
      await client.query("COMMIT");

      // Kirim email konfirmasi (juga bisa dibuat fire-and-forget)
      (async () => {
        try {
            await sendEmail({
                to: resetRequest.user_email,
                subject: "Password Anda Telah Berhasil Direset",
                text: `Halo,\n\nPassword untuk akun Anda (${
                resetRequest.user_email
                }) telah berhasil direset pada ${new Date().toLocaleString(
                "id-ID"
                )}.\n\nJika Anda tidak melakukan aksi ini, segera hubungi administrator.\n\nTerima kasih.`,
                html: `<p>Halo,</p><p>Password untuk akun Anda (${
                resetRequest.user_email
                }) telah berhasil direset pada ${new Date().toLocaleString(
                "id-ID"
                )}.</p><p>Jika Anda tidak melakukan aksi ini, segera hubungi administrator.</p><p>Terima kasih.</p>`,
            });
        } catch (e) {
            console.error("Gagal mengirim email konfirmasi reset password:", e);
        }
      })();

      return {
        message:
          "Password Anda telah berhasil direset. Silakan login dengan password baru Anda.",
      };
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(
        "[ResetPassword] Error processing password reset with token:",
        error
      );
      if (error instanceof AuthError) throw error;
      throw new AuthError(
        error.message || "Gagal mereset password karena kesalahan internal.",
        500
      );
    } finally {
      client.release();
    }
  },
};