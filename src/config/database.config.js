// src/config/database.config.js
import pg from "pg";

const { Pool } = pg;

const dbConfig = {
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || "5432", 10),
  ssl: {
    rejectUnauthorized: false, // Wajib ada
  },
  // Opsi pool tambahan jika perlu
  // max: 20,
  // idleTimeoutMillis: 30000,
  // connectionTimeoutMillis: 2000,
};

export const pool = new Pool(dbConfig);

pool.on("connect", (client) => {
  console.log("Klien database terhubung ke pool");
  // Anda bisa set properti klien di sini jika perlu, misal client.query = ... untuk logging
});

pool.on("error", (err, client) => {
  console.error("Error tak terduga pada klien database idle", err);
  process.exit(-1); // Keluar jika pool error, ini krusial
});

// Fungsi query dasar untuk operasi non-transaksional (opsional, karena model akan lebih baik)
// Atau, model akan langsung menggunakan 'pool.query' atau 'client.query'
export const query = (text, params) => pool.query(text, params);

// Fungsi untuk tes koneksi (bisa dipanggil dari root server.js)
export async function testDbConnection() {
  let client;
  try {
    client = await pool.connect();
    const result = await client.query("SELECT NOW()");
    console.log("Tes koneksi database berhasil! Waktu DB:", result.rows[0].now);
    return true;
  } catch (err) {
    console.error("Gagal tes koneksi database:", err.stack);
    return false;
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Kita akan menggunakan pool.connect() langsung di service/model untuk transaksi
// Jadi, `getPool()` mungkin tidak perlu diekspor jika `pool` sudah diekspor.
