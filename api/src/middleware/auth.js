const jwt = require("jsonwebtoken");
const config = require("../config");
const User = require("../models/User");
const { HttpError } = require("./errors");

const COOKIE = "token";
// Akun lain yang pernah masuk di perangkat ini (untuk "Ganti akun"), maksimal 5.
const ACCOUNTS = "accounts";
const MAX_ACCOUNTS = 5;

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: config.crossSiteCookie ? "none" : "lax",
    secure: config.crossSiteCookie || config.isProduction,
    maxAge: config.jwtDays * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

function sign(user) {
  return jwt.sign({ sub: String(user._id), v: user.tokenVersion || 0 }, config.jwtSecret, { expiresIn: `${config.jwtDays}d` });
}

function readAccounts(req) {
  try {
    const list = JSON.parse(req.cookies?.[ACCOUNTS] || "[]");
    return Array.isArray(list) ? list.filter((t) => typeof t === "string").slice(0, MAX_ACCOUNTS) : [];
  } catch {
    return [];
  }
}

function subOf(token) {
  try {
    return jwt.verify(token, config.jwtSecret).sub;
  } catch {
    return null;
  }
}

function writeAccounts(res, tokens) {
  const seen = new Set();
  const list = [];
  for (const t of tokens) {
    const sub = subOf(t);
    if (sub && !seen.has(sub)) {
      seen.add(sub);
      list.push(t);
    }
  }
  if (list.length) res.cookie(ACCOUNTS, JSON.stringify(list.slice(-MAX_ACCOUNTS)), cookieOptions());
  else {
    const { maxAge, ...opts } = cookieOptions();
    res.clearCookie(ACCOUNTS, opts);
  }
  return list;
}

// Masuk sebagai user ini, dan ingat akunnya di daftar akun perangkat.
function issueToken(res, user, req = null) {
  const token = sign(user);
  res.cookie(COOKIE, token, cookieOptions());
  if (req) {
    // Akun yang sedang dipakai sebelum ini ikut diingat, supaya bisa dipilih lagi lewat "Ganti akun".
    const current = req.cookies?.[COOKIE];
    const others = [...readAccounts(req), ...(current ? [current] : [])].filter((t) => subOf(t) !== String(user._id));
    writeAccounts(res, [...others, token]);
  }
  return token;
}

// forget=false: keluar tapi akun tetap ada di daftar perangkat (masuk lagi sekali klik).
function clearToken(res, req = null, { forget = true } = {}) {
  const { maxAge, ...opts } = cookieOptions();
  res.clearCookie(COOKIE, opts);
  if (req && forget && req.user) writeAccounts(res, readAccounts(req).filter((t) => subOf(t) !== String(req.user._id)));
}

// Membaca user dari cookie (atau header Authorization: Bearer). Tidak wajib.
async function loadUser(req, res, next) {
  req.user = null;
  const header = req.headers.authorization || "";
  const token = req.cookies?.[COOKIE] || (header.startsWith("Bearer ") ? header.slice(7) : "");
  if (token) {
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      const user = await User.findById(payload.sub);
      if (user && (user.tokenVersion || 0) === (payload.v || 0)) req.user = user;
    } catch {
      // token kedaluwarsa / tidak valid: dianggap belum masuk
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) throw new HttpError(401, "Silakan masuk terlebih dahulu.");
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) throw new HttpError(401, "Silakan masuk terlebih dahulu.");
  if (req.user.role !== "admin") throw new HttpError(403, "Khusus admin.");
  next();
}

const isAdmin = (user) => user?.role === "admin";
const isOwner = (user, id) => Boolean(user && id && String(user._id) === String(id._id || id));

module.exports = { issueToken, clearToken, loadUser, requireAuth, requireAdmin, isAdmin, isOwner, readAccounts, writeAccounts, subOf, sign, COOKIE, cookieOptions };
