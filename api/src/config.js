// Semua pengaturan dibaca dari .env (lihat .env.example).
require("dotenv").config({ quiet: true });

const list = (v, fallback) =>
  (v || fallback)
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);

const isProduction = process.env.NODE_ENV === "production";

// Vercel: disk tidak permanen, body maksimal 4,5 MB, waktu tiap permintaan terbatas.
const onVercel = Boolean(process.env.VERCEL);

module.exports = {
  isProduction,
  onVercel,
  // Waktu total satu permintaan LUMA, sedikit di bawah maxDuration (120 dtk) di vercel.json.
  lumaBudgetMs: onVercel ? 110 * 1000 : 10 * 60 * 1000,
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
  // Dipakai otomatis bila model utama sibuk/gagal.
  geminiFallbackModel: process.env.GEMINI_FALLBACK_MODEL ?? "gemini-2.5-flash",

  // Penyimpanan file: Cloudinary kalau CLOUDINARY_URL diisi, selain itu disk lokal.
  cloudinaryUrl: process.env.CLOUDINARY_URL || "",
  uploadDir: process.env.UPLOAD_DIR || require("path").join(__dirname, "..", "uploads"),
  publicApiUrl: (process.env.PUBLIC_API_URL || "").replace(/\/+$/, ""),
  maxPdfMb: Number(process.env.MAX_PDF_MB) || 40,

  // Batas pemakaian LUMA per user per hari (admin tidak dibatasi). 0 = tanpa batas.
  lumaDailyLimit: Number(process.env.LUMA_DAILY_LIMIT ?? 40),

  // Email (lupa password). Gmail: SMTP_USER = alamat Gmail, SMTP_PASS = App Password 16 huruf.
  smtp: {
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT) || 465,
    user: process.env.SMTP_USER || "",
    // App Password Google sering disalin dengan spasi ("abcd efgh ..."); spasinya dibuang.
    pass: (process.env.SMTP_PASS || "").replace(/\s+/g, ""),
    from: process.env.SMTP_FROM || "",
  },
  // Email kontak publik (laporan hak cipta / privasi). Kosong = SMTP_USER.
  contactEmail: process.env.CONTACT_EMAIL || process.env.SMTP_USER || "",
  // Alamat web yang dibuka user (untuk link reset password di email).
  appUrl: (process.env.APP_URL || (process.env.CLIENT_ORIGIN || "http://localhost:5173").split(",")[0]).trim().replace(/\/+$/, ""),
};
