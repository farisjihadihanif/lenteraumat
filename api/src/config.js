// Semua pengaturan dibaca dari .env (lihat .env.example).
require("dotenv").config({ quiet: true });

const list = (v, fallback) =>
  (v || fallback)
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);

const isProduction = process.env.NODE_ENV === "production";

module.exports = {
  isProduction,
  port: Number(process.env.PORT) || 4000,
  mongoUrl: process.env.MONGO_URL || "",
  // SECRET dipertahankan dari versi lama supaya .env lama tetap jalan.
  jwtSecret: process.env.JWT_SECRET || process.env.SECRET || "",
  jwtDays: Number(process.env.JWT_DAYS) || 7,
  // Alamat frontend yang boleh memanggil API (dipisah koma).
  clientOrigins: list(process.env.CLIENT_ORIGIN, "http://localhost:5173,http://localhost:5174"),
  // Cookie lintas domain (frontend & API beda domain, mis. Netlify + Render)
  // butuh SameSite=None + Secure. Di localhost cukup Lax.
  crossSiteCookie: process.env.CROSS_SITE_COOKIE === "true",

  // Akun admin pertama dibuat otomatis saat server mulai (kalau belum ada admin).
  adminEmail: process.env.ADMIN_EMAIL || "",
  adminUsername: process.env.ADMIN_USERNAME || "admin",
  adminPassword: process.env.ADMIN_PASSWORD || "",

  // LUMA AI (Google Gemini). Key hanya ada di server, tidak pernah dikirim ke browser.
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  // "gemini-flash-latest" otomatis mengikuti model Flash terbaru dari Google.
  geminiModel: process.env.GEMINI_MODEL || "gemini-flash-latest",

  // Penyimpanan file: Cloudinary kalau CLOUDINARY_URL diisi, selain itu disk lokal.
  cloudinaryUrl: process.env.CLOUDINARY_URL || "",
  uploadDir: process.env.UPLOAD_DIR || require("path").join(__dirname, "..", "uploads"),
  publicApiUrl: (process.env.PUBLIC_API_URL || "").replace(/\/+$/, ""),
  maxPdfMb: Number(process.env.MAX_PDF_MB) || 40,
};
