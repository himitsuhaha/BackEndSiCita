// src/app.js
import express from "express";
import cors from "cors";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import webpush from "web-push";
import passport from "passport";

import {
  PORT,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  VAPID_SUBJECT,
  ALLOWED_ORIGINS,
  SOCKET_IO_CORS_ORIGINS,
} from "./config/server.config.js";
import { configureJwtStrategy } from "./config/passport.config.js";
import mainApiRouter from "./api/index.js";
import { errorHandler } from "./middlewares/errorHandler.middleware.js";
import { deviceStatusService } from "./services/deviceStatus.service.js";
import { DEVICE_STATUS_CHECK_INTERVAL_MS } from "./config/server.config.js";

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

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
  console.error(
    "VAPID keys atau subject tidak dikonfigurasi di server.config.js (dari .env)."
  );
} else {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  console.log("Web-push VAPID details berhasil dikonfigurasi.");
}

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
