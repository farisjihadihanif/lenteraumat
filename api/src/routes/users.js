const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Book = require("../models/Book");
const Discussion = require("../models/Discussion");
const { requireAuth, issueToken, clearToken } = require("../middleware/auth");
const { upload, checkImageSize } = require("../middleware/upload");
const { HttpError } = require("../middleware/errors");
const storage = require("../services/storage");
const { str } = require("../util");
const { deleteUserContent } = require("./cleanup");

const router = express.Router();

const URL_OK = (v) => !v || /^https?:\/\/[^\s"'<>]+$/.test(v);

router.patch("/me", requireAuth, upload.single("foto"), checkImageSize("foto"), async (req, res) => {
  const u = req.user;
  const b = req.body || {};
  if ("namaLengkap" in b) {
    const nama = str(b.namaLengkap, 100);
    if (!nama) throw new HttpError(400, "Nama lengkap wajib diisi.");
    u.namaLengkap = nama;
  }
  if ("bio" in b) u.bio = str(b.bio, 300);
  for (const key of ["instagramUrl", "linkedinUrl"]) {
    if (key in b) {
      const v = str(b[key], 300);
      if (!URL_OK(v)) throw new HttpError(400, "Link harus diawali http:// atau https://");
      u[key] = v;
    }
  }
  if (req.file) {
    const saved = await storage.save(req.file, "profil");
    u.fotoProfil = saved.url;
  }
  await u.save();
  res.json({ user: u.toSelf() });
});

router.put("/me/password", requireAuth, async (req, res) => {
  const user = await User.findById(req.user._id).select("+password");
  if (!(await bcrypt.compare(String(req.body.passwordLama || ""), user.password))) {
    throw new HttpError(400, "Password lama salah.");
  }
  const baru = String(req.body.passwordBaru || "");
  if (baru.length < 8) throw new HttpError(400, "Password baru minimal 8 karakter.");
  user.password = await bcrypt.hash(baru, 10);
  user.tokenVersion = (user.tokenVersion || 0) + 1; // keluarkan sesi di perangkat lain
  await user.save();
  issueToken(res, user, req);
  res.json({ ok: true });
});

router.delete("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.user._id).select("+password");
  if (!(await bcrypt.compare(String(req.body?.password || ""), user.password))) {
    throw new HttpError(400, "Password salah.");
  }
  if (user.role === "admin" && (await User.countDocuments({ role: "admin" })) <= 1) {
    throw new HttpError(400, "Kamu admin terakhir. Jadikan user lain admin dulu.");
  }
  await deleteUserContent(user._id);
  await user.deleteOne();
  clearToken(res, req);
  res.json({ ok: true });
});

// Profil publik + buku & diskusi miliknya.
router.get("/:username", async (req, res) => {
  const user = await User.findOne({ username: str(req.params.username, 30).toLowerCase() });
  if (!user) throw new HttpError(404, "Pengguna tidak ditemukan.");
  const [books, discussions, reposts] = await Promise.all([
    Book.find({ uploadedBy: user._id, status: "disetujui" }).sort({ createdAt: -1 }).limit(24).select("judul penulis cover kategori ratingAvg ratingCount"),
    Discussion.find({ author: user._id }).sort({ createdAt: -1 }).limit(10).select("judul createdAt balasanCount likeCount repostCount book").populate("book", "judul"),
    Discussion.find({ reposts: user._id }).sort({ lastActivityAt: -1 }).limit(10).select("judul createdAt balasanCount likeCount repostCount book author").populate("book", "judul").populate("author", "username namaLengkap"),
  ]);
  res.json({ user: user.toPublic(), books, discussions, reposts });
});

module.exports = router;
