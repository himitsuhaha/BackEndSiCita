// src/app.js
import express from "express";
import cors from "cors";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import passport from "passport";
import admin from "firebase-admin";

import {
  PORT,
  ALLOWED_ORIGINS,
  SOCKET_IO_CORS_ORIGINS,
} from "./config/server.config.js";
import { configureJwtStrategy } from "./config/passport.config.js";
import mainApiRouter from "./api/index.js";
import { errorHandler } from "./middlewares/errorHandler.middleware.js";
import { deviceStatusService } from "./services/deviceStatus.service.js";
import { DEVICE_STATUS_CHECK_INTERVAL_MS } from "./config/server.config.js";

// ▼▼▼ SOLUSI FINAL: Inisialisasi Firebase dari Environment Variable ▼▼▼
try {
  // 1. Periksa apakah environment variable sudah diatur
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set.");
  }
  
  // 2. Parse konten JSON dari environment variable
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

  // 3. Inisialisasi Firebase Admin SDK dengan kredensial yang sudah di-parse
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("Firebase Admin SDK successfully initialized from environment variable.");
} catch (error) {
  console.error("Failed to initialize Firebase Admin SDK. Ensure the FIREBASE_SERVICE_ACCOUNT_KEY environment variable is set correctly and is valid JSON.", error);
  process.exit(1); // Hentikan server jika inisialisasi Firebase gagal
}
// ▲▲▲ AKHIR SOLUSI FINAL ▲▲▲

const app = express();

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());

app.use(passport.initialize()); // Inisialisasi Passport
configureJwtStrategy(passport); // Terapkan konfigurasi strategi JWT kita

export const httpServer = http.createServer(app);
export const io = new SocketIOServer(httpServer, {
  // io diekspor agar bisa digunakan controller/service
  cors: {
    origin: SOCKET_IO_CORS_ORIGINS,
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log(`Seorang klien Socket.IO terhubung: ${socket.id}`);
  socket.on("disconnect", () => {
    console.log(`Klien Socket.IO terputus: ${socket.id}`);
  });
});

// --- ROUTES ---
app.get("/", (req, res) => {
  res.send(
    "Selamat datang di Server Pemantauan Banjir! (Refactored Structure)"
  );
});

// Mount router API utama di bawah path /api
app.use("/api", mainApiRouter); // <-- GUNAKAN ROUTER API UTAMA

// --- ERROR HANDLING MIDDLEWARE ---
// Middleware ini harus diletakkan SETELAH semua route dan middleware lain
app.use(errorHandler); // <-- GUNAKAN ERROR HANDLER GLOBAL

if (DEVICE_STATUS_CHECK_INTERVAL_MS > 0) {
  // Hanya jalankan jika interval diset > 0
  setInterval(() => {
    deviceStatusService.checkDeviceStatuses();
  }, DEVICE_STATUS_CHECK_INTERVAL_MS);
  console.log(
    `Device status check will run every ${
      DEVICE_STATUS_CHECK_INTERVAL_MS / 1000
    } seconds.`
  );
}
export default app;