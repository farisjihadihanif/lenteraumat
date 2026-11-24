// Pintu masuk Vercel: aplikasi Express tanpa listen(). Server biasa (laptop/VPS) tetap memakai ../index.js.
const config = require("../src/config");
const { connect, mongoose } = require("../src/db");
const { createApp } = require("../src/app");
const { ensureAdmin } = require("../src/seed");

const app = createApp();

// Satu koneksi dipakai ulang selama instance hidup. Kalau gagal, permintaan berikutnya mencoba lagi.
let ready = null;
function siap() {
  if (ready && mongoose.connection.readyState === 0) ready = null;
  if (!ready) {
    const attempt = (async () => {
      if (!config.jwtSecret || config.jwtSecret.length < 16) throw new Error("JWT_SECRET belum diisi (minimal 16 karakter acak).");
      await connect(config.mongoUrl, { dnsFallback: false, maxPoolSize: 5 });
      // Dua instance bisa mulai bersamaan; kalah cepat membuat admin bukan alasan menolak permintaan.
      await ensureAdmin().catch((e) => console.error("Admin awal gagal dibuat:", e.message));
    })();
    ready = attempt;
    attempt.catch(() => {
      if (ready === attempt) ready = null;
    });
  }
  return ready;
}

module.exports = async function handler(req, res) {
  try {
    await siap();
  } catch (error) {
    console.error("API belum siap:", error.message);
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ message: "Server sedang tidak siap. Coba lagi sebentar." }));
  }
  return app(req, res);
};
