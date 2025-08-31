// src/config/server.config.js
export const PORT = process.env.PORT || 5000;

export const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
export const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
export const VAPID_SUBJECT = process.env.VAPID_SUBJECT;

export const RAINFALL_THRESHOLD_NO_RAIN_MAX = 50;
export const RAINFALL_THRESHOLD_LIGHT_RAIN_MAX = 1000;
export const RAINFALL_THRESHOLD_MODERATE_RAIN_MAX = 2500;

// Global alert thresholds (fallback)
export const ALERT_WATER_LEVEL_PERCENTAGE_THRESHOLD = 0.8; // 80%
export const ABSOLUTE_WATER_LEVEL_ALERT_THRESHOLD_CM = 200; // 200cm

// Frontend URLs for CORS
export const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL || "http://localhost:3000",
  process.env.FRONTEND_IP_URL,
].filter(Boolean);

// Socket.IO CORS
export const SOCKET_IO_CORS_ORIGINS =
  ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : "*";

// Device offline detection thresholds
export const DEVICE_OFFLINE_THRESHOLD_SECONDS = 840;
export const DEVICE_STATUS_CHECK_INTERVAL_MS = 60000;

export const JWT_SECRET =
  process.env.JWT_SECRET || "your-very-strong-and-secret-jwt-key-replace-this";
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";

if (
  process.env.NODE_ENV !== "test" &&
  JWT_SECRET === "your-very-strong-and-secret-jwt-key-replace-this"
) {
  console.warn(
    "PERINGATAN: JWT_SECRET menggunakan nilai default yang tidak aman. Harap set di file .env!"
  );
}

// Konfigurasi Email (Brevo API)
export const BREVO_API_KEY = process.env.BREVO_API_KEY;
export const BREVO_FROM_EMAIL = process.env.BREVO_FROM_EMAIL;
export const BREVO_FROM_NAME = process.env.BREVO_FROM_NAME || "Sistem Pemantauan Banjir";

export const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// Alert Logic Thresholds
export const RAPID_RISE_THRESHOLD_CM_PER_MINUTE = 5;

// Water Quality pH Values
export const PH_CRITICAL_LOW = 5.5;
export const PH_POOR_LOW = 6.5;
export const PH_GOOD_LOW = 6.5;
export const PH_GOOD_HIGH = 8.5;
export const PH_POOR_HIGH = 9.5;
export const PH_CRITICAL_HIGH = 9.5;

// Water Quality Turbidity (NTU) Values
export const TURBIDITY_GOOD_MAX = 25;
export const TURBIDITY_MODERATE_MAX = 100;
export const TURBIDITY_POOR_MAX = 300;