// src/utils/email.util.js
import {
  BREVO_API_KEY,
  BREVO_FROM_EMAIL,
  BREVO_FROM_NAME,
} from "../config/server.config.js";

/**
 * Mengirim email menggunakan Brevo HTTP API.
 * @param {string} to - Alamat email penerima.
 * @param {string} subject - Subjek email.
 * @param {string} text - Isi email dalam format teks polos.
 * @param {string} html - Isi email dalam format HTML.
 * @returns {Promise<void>}
 */
export const sendEmail = async ({ to, subject, text, html }) => {
  if (!BREVO_API_KEY || !BREVO_FROM_EMAIL) {
    console.error("Konfigurasi Brevo (API Key/From Email) tidak lengkap.");
    // Segera hentikan fungsi jika konfigurasi tidak ada
    return;
  }

  // Siapkan data email sesuai format yang diminta Brevo API
  const emailPayload = {
    sender: {
      name: BREVO_FROM_NAME,
      email: BREVO_FROM_EMAIL,
    },
    to: [
      {
        email: to,
      },
    ],
    subject: subject,
    htmlContent: html,
    textContent: text,
  };

  try {
    // Panggil endpoint Brevo API menggunakan fetch
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": BREVO_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    // Periksa apakah respons dari server Brevo adalah sukses (kode 2xx)
    if (!response.ok) {
      // Jika tidak sukses, baca body error untuk detailnya
      const errorData = await response.json();
      // Lemparkan error agar bisa ditangkap oleh blok catch di bawah
      throw new Error(`Brevo API Error: ${response.statusText} - ${JSON.stringify(errorData)}`);
    }

    // Jika sukses, baca body respons untuk mendapatkan messageId
    const data = await response.json();
    console.log(`Email berhasil dikirim ke ${to} melalui Brevo API. Message ID:`, data.messageId);

  } catch (error) {
    console.error("Gagal mengirim email melalui Brevo API. Detail Error:");
    // Cetak error lengkap untuk diagnosis
    console.error(error);
  }
};