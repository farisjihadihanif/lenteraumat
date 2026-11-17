const jwt = require("jsonwebtoken");
const config = require("../config");
const User = require("../models/User");
const { HttpError } = require("./errors");

const COOKIE = "token";

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: config.crossSiteCookie ? "none" : "lax",
    secure: config.crossSiteCookie || config.isProduction,
    maxAge: config.jwtDays * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

function issueToken(res, user) {
  const token = jwt.sign({ sub: String(user._id), v: user.tokenVersion || 0 }, config.jwtSecret, {
    expiresIn: `${config.jwtDays}d`,
  });
  res.cookie(COOKIE, token, cookieOptions());
  return token;
}

function clearToken(res) {
  const { maxAge, ...opts } = cookieOptions();
  res.clearCookie(COOKIE, opts);
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

module.exports = { issueToken, clearToken, loadUser, requireAuth, requireAdmin, isAdmin, isOwner };
