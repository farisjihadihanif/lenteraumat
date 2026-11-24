const jwt = require("jsonwebtoken");
const config = require("../config");
const User = require("../models/User");
const { HttpError } = require("./errors");

const COOKIE = "lenteraumat_token";
// Akun lain yang pernah masuk di perangkat ini (untuk "Ganti akun"), maksimal 5.
const ACCOUNTS = "lenteraumat_accounts";
// Nama cookie sebelum ganti nama proyek; dipindahkan supaya user tetap masuk.
const OLD_COOKIE = "token";
const OLD_ACCOUNTS = "accounts";
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

function parseAccounts(raw) {
  try {
    const list = JSON.parse(raw || "[]");
    return Array.isArray(list) ? list.filter((t) => typeof t === "string").slice(0, MAX_ACCOUNTS) : [];
  } catch {
    return [];
  }
}

const readAccounts = (req) => parseAccounts(req.cookies?.[ACCOUNTS]);

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

// Pindahkan cookie lama ke nama baru. Hanya yang ditandatangani server ini: di localhost, proyek lain
// bisa memakai nama "token" juga. Ditulis hanya di /api/auth (dipanggil tiap web dibuka), supaya
// Set-Cookie tidak menempel di respons yang boleh di-cache publik seperti file buku.
function migrateCookies(req, res, next) {
  const { maxAge, ...opts } = cookieOptions();
  const persist = req.path.startsWith("/api/auth/");
  const oldToken = req.cookies?.[OLD_COOKIE];
  if (oldToken && subOf(oldToken)) {
    if (!req.cookies[COOKIE]) {
      req.cookies[COOKIE] = oldToken;
      if (persist) res.cookie(COOKIE, oldToken, cookieOptions());
    }
    if (persist) res.clearCookie(OLD_COOKIE, opts);
  }
  const oldAccounts = parseAccounts(req.cookies?.[OLD_ACCOUNTS]).filter(subOf);
  if (oldAccounts.length) {
    if (!req.cookies[ACCOUNTS]) {
      req.cookies[ACCOUNTS] = JSON.stringify(oldAccounts);
      if (persist) writeAccounts(res, oldAccounts);
    }
    if (persist) res.clearCookie(OLD_ACCOUNTS, opts);
  }
  next();
}

// Aplikasi mobile (header X-Client: mobile) memakai token Bearer, bukan cookie. Permintaan dari browser
// selalu membawa Origin atau Sec-Fetch-Site, jadi halaman web tidak bisa meminta token lewat header ini.
const isMobile = (req) => req.headers["x-client"] === "mobile" && !req.headers.origin && !req.headers["sec-fetch-site"];

function bearerOf(req) {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || "");
  return m ? m[1] : "";
}

// Masuk: aplikasi menerima token di balasan (tanpa cookie), web menerima cookie httpOnly (tanpa token).
function startSession(req, res, user) {
  if (!isMobile(req)) {
    issueToken(res, user, req);
    return {};
  }
  res.setHeader("Cache-Control", "no-store");
  return { token: sign(user) };
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

// Membaca user dari header Authorization: Bearer (aplikasi), atau cookie (web). Tidak wajib.
async function loadUser(req, res, next) {
  req.user = null;
  const token = bearerOf(req) || req.cookies?.[COOKIE];
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

module.exports = { isMobile, bearerOf, startSession, issueToken, clearToken, migrateCookies, loadUser, requireAuth, requireAdmin, isAdmin, isOwner, readAccounts, writeAccounts, subOf, sign, COOKIE, cookieOptions };
