// Batas pemakaian LUMA per user per hari, supaya kuota Gemini tidak habis oleh satu orang.
const config = require("../config");
const AiUsage = require("../models/AiUsage");
const { HttpError } = require("../middleware/errors");

// Tanggal hari ini di WIB (UTC+7), mis. "2026-11-18". Reset tiap tengah malam WIB.
const today = (now = new Date()) => new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const unlimited = (user) => !config.lumaDailyLimit || user?.role === "admin";

async function usage(user) {
  if (unlimited(user)) return { limit: 0, used: 0, remaining: null };
  const doc = await AiUsage.findOne({ user: user._id, day: today() });
  const used = doc?.count || 0;
  return { limit: config.lumaDailyLimit, used, remaining: Math.max(0, config.lumaDailyLimit - used) };
}

// Dicek sebelum memanggil Gemini; dihitung hanya kalau permintaan berhasil.
async function checkQuota(req, res, next) {
  if (unlimited(req.user)) return next();
  const { remaining } = await usage(req.user);
  if (remaining <= 0) {
    throw new HttpError(429, `Batas LUMA hari ini (${config.lumaDailyLimit} permintaan) sudah habis. Bisa dipakai lagi besok mulai pukul 00.00 WIB.`);
  }
  // Dicatat sebelum jawaban dikirim: di Vercel fungsi bisa dibekukan begitu jawaban selesai.
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 400) return json(body);
    AiUsage.updateOne({ user: req.user._id, day: today() }, { $inc: { count: 1 }, $setOnInsert: { createdAt: new Date() } }, { upsert: true })
      .catch((e) => console.error("Kuota LUMA gagal dicatat:", e.message))
      .finally(() => json(body));
    return res;
  };
  next();
}

module.exports = { checkQuota, usage, today };
