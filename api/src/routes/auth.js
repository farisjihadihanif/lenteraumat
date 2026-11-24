const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const mail = require("../services/mail");
const rateLimit = require("express-rate-limit");
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const config = require("../config");
const { isMobile, bearerOf, startSession, issueToken, clearToken, readAccounts, writeAccounts, subOf, COOKIE, cookieOptions } = require("../middleware/auth");
const { ipKey } = require("../middleware/clientIp");
const { HttpError } = require("../middleware/errors");
const { str } = require("../util");

const router = express.Router();
// Login: per IP, dan di Vercel ditambah akun yang dituju. Daftar & lupa password: selalu per IP,
// supaya mengganti-ganti email tidak menghindari batasnya.
const account = (req) => str(req.body?.identifier || req.body?.email || req.body?.username, 120).toLowerCase();
const authLimit = (keyGenerator) =>
  rateLimit({ keyGenerator, windowMs: 15 * 60 * 1000, limit: Number(process.env.AUTH_RATE_LIMIT) || 20, standardHeaders: true, legacyHeaders: false, message: { message: "Terlalu banyak percobaan. Coba lagi 15 menit lagi." } });
const loginLimiter = authLimit((req) => (config.onVercel ? `${ipKey(req)}|${account(req)}` : ipKey(req)));
const registerLimiter = authLimit(ipKey);

const USERNAME = /^[a-z0-9_.]{3,30}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

router.post("/register", registerLimiter, async (req, res) => {
  const username = str(req.body.username, 30).toLowerCase();
  const email = str(req.body.email, 120).toLowerCase();
  const password = String(req.body.password || "");
  const namaLengkap = str(req.body.namaLengkap, 100);
  if (!USERNAME.test(username)) throw new HttpError(400, "Username 3–30 karakter: huruf kecil, angka, titik, atau garis bawah.");
  if (!EMAIL.test(email)) throw new HttpError(400, "Format email tidak valid.");
  if (password.length < 8) throw new HttpError(400, "Password minimal 8 karakter.");
  if (!namaLengkap) throw new HttpError(400, "Nama lengkap wajib diisi.");

  const user = await User.create({ username, email, namaLengkap, password: await bcrypt.hash(password, 10), role: "user" });
  res.status(201).json({ user: user.toSelf(), ...startSession(req, res, user) });
});

router.post("/login", loginLimiter, async (req, res) => {
  const identifier = str(req.body.identifier ?? req.body.username, 120).toLowerCase();
  const password = String(req.body.password || "");
  const user = await User.findOne(identifier.includes("@") ? { email: identifier } : { username: identifier }).select("+password");
  // Pesan sama untuk user tidak ada / password salah, supaya tidak bisa menebak akun.
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new HttpError(401, "Username/email atau password salah.");
  }
  res.json({ user: user.toSelf(), ...startSession(req, res, user) });
});

// Keluar dari akun ini. Akun tetap tersimpan di perangkat untuk "Ganti akun",
// kecuali diminta dilupakan ({ forget: true }).
router.post("/logout", (req, res) => {
  const current = req.cookies?.[COOKIE];
  const keep = !req.body?.forget && req.user && current;
  clearToken(res, req, { forget: !keep });
  if (keep) writeAccounts(res, [...readAccounts(req).filter((t) => subOf(t) !== String(req.user._id)), current]);
  res.json({ ok: true });
});

// Keluar dari semua akun di perangkat ini.
router.post("/logout-all", (req, res) => {
  clearToken(res, req);
  writeAccounts(res, []);
  res.json({ ok: true });
});

// Daftar akun yang tersimpan di perangkat ini (token kedaluwarsa / password diganti otomatis hilang).
async function validAccounts(req) {
  const out = [];
  const current = req.cookies?.[COOKIE];
  const tokens = readAccounts(req);
  if (current && !tokens.some((t) => subOf(t) === subOf(current))) tokens.push(current);
  for (const token of tokens) {
    try {
      const p = jwt.verify(token, config.jwtSecret);
      const u = await User.findById(p.sub);
      if (u && (u.tokenVersion || 0) === (p.v || 0)) out.push({ token, user: u });
    } catch {
      /* lewati */
    }
  }
  return out;
}

router.get("/accounts", async (req, res) => {
  const list = await validAccounts(req);
  writeAccounts(res, list.map((a) => a.token));
  res.json({
    accounts: list.map(({ user }) => ({ ...user.toPublic(), current: Boolean(req.user && String(req.user._id) === String(user._id)) })),
  });
});

router.post("/switch", async (req, res) => {
  const id = String(req.body.userId || "");
  const found = (await validAccounts(req)).find((a) => String(a.user._id) === id);
  if (!found) throw new HttpError(401, "Akun itu perlu masuk ulang.");
  res.cookie(COOKIE, found.token, cookieOptions());
  res.json({ user: found.user.toSelf() });
});

// Hapus satu akun dari daftar perangkat (tanpa keluar dari akun yang sedang dipakai).
router.post("/accounts/forget", async (req, res) => {
  const id = String(req.body.userId || "");
  const rest = (await validAccounts(req)).filter((a) => String(a.user._id) !== id);
  writeAccounts(res, rest.map((a) => a.token));
  res.json({ ok: true });
});

// ===== Lupa password =====
const resetLimit = (keyGenerator, standardHeaders = true) =>
  rateLimit({ keyGenerator, windowMs: 60 * 60 * 1000, limit: Number(process.env.RESET_RATE_LIMIT) || 5, standardHeaders, legacyHeaders: false, message: { message: "Terlalu banyak permintaan. Coba lagi 1 jam lagi." } });
// Satu email juga dibatasi walau permintaannya datang dari banyak IP.
const forgotAccountLimiter = resetLimit(account, false);
const resetLimiter = resetLimit(ipKey);
const RESET_MINUTES = 30;
const hashToken = (t) => crypto.createHash("sha256").update(t).digest("hex");

function resetEmail(user, link) {
  const nama = (user.namaLengkap || user.username).split(" ")[0];
  const text = `Halo ${nama},\n\nAda permintaan untuk mengganti password akun LenteraUmat @${user.username}. Buka link ini dalam ${RESET_MINUTES} menit:\n\n${link}\n\nKalau kamu tidak meminta ini, abaikan saja email ini. Password-mu tidak berubah.\n\nLenteraUmat`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1B2B3A;max-width:520px">
<p>Halo ${nama.replace(/[<>&"]/g, "")},</p>
<p>Ada permintaan untuk mengganti password akun LenteraUmat <b>@${user.username}</b>. Link berikut berlaku ${RESET_MINUTES} menit.</p>
<p><a href="${link}" style="display:inline-block;background:#FFB347;color:#1B2B3A;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Ganti password</a></p>
<p style="color:#5B6B7A;font-size:13px">Kalau kamu tidak meminta ini, abaikan email ini. Password-mu tidak berubah.</p>
</div>`;
  return { subject: "Ganti password LenteraUmat", text, html };
}

// Jawaban selalu sama, ada atau tidak akunnya, supaya email terdaftar tidak bisa ditebak.
router.post("/forgot", resetLimiter, forgotAccountLimiter, async (req, res) => {
  const email = str(req.body.email, 120).toLowerCase();
  if (!EMAIL.test(email)) throw new HttpError(400, "Format email tidak valid.");
  if (!mail.configured() && config.isProduction) {
    throw new HttpError(503, "Pengiriman email belum diatur. Hubungi admin.");
  }
  const user = await User.findOne({ email });
  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    user.resetTokenHash = hashToken(token);
    user.resetTokenExpires = new Date(Date.now() + RESET_MINUTES * 60 * 1000);
    await user.save();
    const link = `${config.appUrl}/reset-password?token=${token}`;
    if (mail.configured()) {
      try {
        await mail.send({ to: user.email, ...resetEmail(user, link) });
      } catch (error) {
        console.error("Gagal kirim email reset:", error.message);
        throw new HttpError(502, "Email gagal dikirim. Coba lagi beberapa saat lagi.");
      }
    } else {
      // Mode pengembangan tanpa SMTP: link ditampilkan di terminal API.
      console.log(`[lupa password] SMTP belum diatur. Link reset untuk @${user.username}: ${link}`);
    }
  }
  res.json({ ok: true, message: `Kalau email itu terdaftar, link ganti password sudah dikirim. Cek juga folder spam. Link berlaku ${RESET_MINUTES} menit.` });
});

router.post("/reset", resetLimiter, async (req, res) => {
  const token = String(req.body.token || "");
  const password = String(req.body.password || "");
  if (!/^[a-f0-9]{64}$/.test(token)) throw new HttpError(400, "Link ganti password tidak valid.");
  if (password.length < 8) throw new HttpError(400, "Password minimal 8 karakter.");
  const user = await User.findOne({ resetTokenHash: hashToken(token), resetTokenExpires: { $gt: new Date() } });
  if (!user) throw new HttpError(400, "Link sudah kedaluwarsa atau sudah dipakai. Minta link baru.");
  user.password = await bcrypt.hash(password, 10);
  user.tokenVersion = (user.tokenVersion || 0) + 1; // semua sesi lama keluar
  user.resetTokenHash = undefined;
  user.resetTokenExpires = undefined;
  await user.save();
  issueToken(res, user, req);
  res.json({ user: user.toSelf() });
});

// Aplikasi memperpanjang token lewat /me (Bearer + X-Client: mobile): dibatasi seperti masuk, per IP
// dan akun. Web tidak pernah mendapat token di sini dan tidak ikut dibatasi.
const refreshing = (req) => isMobile(req) && Boolean(bearerOf(req));
const refreshLimiter = rateLimit({
  keyGenerator: (req) => (config.onVercel && req.user ? `${ipKey(req)}|${req.user._id}` : ipKey(req)),
  skip: (req) => !refreshing(req),
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.REFRESH_RATE_LIMIT) || Number(process.env.AUTH_RATE_LIMIT) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Terlalu banyak percobaan. Coba lagi 15 menit lagi." },
});

router.get("/me", refreshLimiter, (req, res) => {
  if (!refreshing(req)) return res.json({ user: req.user ? req.user.toSelf() : null });
  // Token mati: aplikasi harus tahu supaya menghapusnya, tidak cukup "tamu".
  if (!req.user) throw new HttpError(401, "Sesi berakhir. Silakan masuk lagi.");
  res.json({ user: req.user.toSelf(), ...startSession(req, res, req.user) });
});

module.exports = router;
