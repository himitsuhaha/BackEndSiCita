// server.js (di root folder project-root/)

import { httpServer } from "./src/app.js"; // Impor httpServer dari src/app.js
import { PORT } from "./src/config/server.config.js"; // Impor PORT dari config
import { testDbConnection } from "./src/config/database.config.js"; // Impor fungsi tes DB

async function startServer() {
  // Tes koneksi database terlebih dahulu
  const dbConnected = await testDbConnection();
  if (!dbConnected) {
    console.error("Gagal memulai server karena koneksi database bermasalah.");
    process.exit(1); // Keluar jika DB tidak terhubung
  }

  httpServer.listen(PORT, () => {
    // Di log ini, kita mungkin ingin menampilkan alamat IP aktual jika server di-bind ke IP tertentu
    // Untuk sekarang, localhost atau 0.0.0.0 (default) sudah cukup
    console.log(`Server berjalan di http://localhost:${PORT}`);
    console.log(`Backend siap menerima koneksi.`);
  });
}

startServer();
