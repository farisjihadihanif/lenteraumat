const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const User = require("../models/User");
const { issueToken, clearToken } = require("../middleware/auth");
const { HttpError } = require("../middleware/errors");
const { str } = require("../util");

const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: Number(process.env.AUTH_RATE_LIMIT) || 20, standardHeaders: true, legacyHeaders: false, message: { message: "Terlalu banyak percobaan. Coba lagi 15 menit lagi." } });

const USERNAME = /^[a-z0-9_.]{3,30}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

router.post("/register", limiter, async (req, res) => {
  const username = str(req.body.username, 30).toLowerCase();
  const email = str(req.body.email, 120).toLowerCase();
  const password = String(req.body.password || "");
  const namaLengkap = str(req.body.namaLengkap, 100);
  if (!USERNAME.test(username)) throw new HttpError(400, "Username 3–30 karakter: huruf kecil, angka, titik, atau garis bawah.");
  if (!EMAIL.test(email)) throw new HttpError(400, "Format email tidak valid.");
  if (password.length < 8) throw new HttpError(400, "Password minimal 8 karakter.");
  if (!namaLengkap) throw new HttpError(400, "Nama lengkap wajib diisi.");

  const user = await User.create({ username, email, namaLengkap, password: await bcrypt.hash(password, 10), role: "user" });
  issueToken(res, user);
  res.status(201).json({ user: user.toSelf() });
});

router.post("/login", limiter, async (req, res) => {
  const identifier = str(req.body.identifier ?? req.body.username, 120).toLowerCase();
  const password = String(req.body.password || "");
  const user = await User.findOne(identifier.includes("@") ? { email: identifier } : { username: identifier }).select("+password");
  // Pesan sama untuk user tidak ada / password salah, supaya tidak bisa menebak akun.
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new HttpError(401, "Username/email atau password salah.");
  }
  issueToken(res, user);
  res.json({ user: user.toSelf() });
});

router.post("/logout", (req, res) => {
  clearToken(res);
  res.json({ ok: true });
});

router.get("/me", (req, res) => {
  res.json({ user: req.user ? req.user.toSelf() : null });
});

module.exports = router;
