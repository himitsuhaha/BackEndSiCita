// src/middlewares/errorHandler.middleware.js
export const errorHandler = (err, req, res, next) => {
  console.error("[Global Error Handler] Pesan:", err.message);
  if (process.env.NODE_ENV === "development" || true) {
    // Tampilkan stack di dev, atau selalu jika diinginkan
    console.error("[Global Error Handler] Stack:", err.stack);
  }

  const statusCode = err.statusCode || 500; // Ambil statusCode dari AppError, atau default ke 500
  const errorMessage = err.message || "Terjadi kesalahan pada server.";

  res.status(statusCode).json({
    status: "error",
    statusCode: statusCode,
    message: errorMessage,
    // Tampilkan stack hanya di mode development untuk keamanan
    ...((process.env.NODE_ENV === "development" || statusCode === 404) && {
      stack: err.stack,
    }),
  });
};
