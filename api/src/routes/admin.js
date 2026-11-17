const express = require("express");
const Book = require("../models/Book");
const User = require("../models/User");
const Review = require("../models/Review");
const Discussion = require("../models/Discussion");
const Comment = require("../models/Comment");
const { requireAdmin } = require("../middleware/auth");
const { HttpError, isId } = require("../middleware/errors");
const { str, page, escapeRegex, USER_PUBLIC } = require("../util");
const { recomputeRating, deleteUserContent } = require("./cleanup");

const router = express.Router();
router.use(requireAdmin);

router.get("/stats", async (req, res) => {
  const [menunggu, disetujui, ditolak, revisi, users, reviews, discussions, reads] = await Promise.all([
    Book.countDocuments({ status: "menunggu" }),
    Book.countDocuments({ status: "disetujui" }),
    Book.countDocuments({ status: "ditolak" }),
    Book.countDocuments({ status: "revisi" }),
    User.countDocuments(),
    Review.countDocuments(),
    Discussion.countDocuments(),
    Book.aggregate([{ $group: { _id: null, n: { $sum: "$dibaca" } } }]),
  ]);
  res.json({ books: { menunggu, disetujui, ditolak, revisi }, users, reviews, discussions, reads: reads[0]?.n || 0 });
});

// Semua buku (semua status) untuk dikelola admin.
router.get("/books", async (req, res) => {
  const { page: p, limit, skip } = page(req, { def: 20, max: 100 });
  const filter = {};
  if (Book.STATUSES.includes(req.query.status)) filter.status = req.query.status;
  const q = str(req.query.q, 100);
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ judul: rx }, { penulis: rx }];
  }
  const sort = filter.status === "menunggu" ? { updatedAt: 1 } : { updatedAt: -1 };
  const [items, total] = await Promise.all([
    Book.find(filter).sort(sort).skip(skip).limit(limit).select("-disimpan -coverStored").populate("uploadedBy", `${USER_PUBLIC} email`).populate("reviewedBy", "username namaLengkap"),
    Book.countDocuments(filter),
  ]);
  res.json({ items, total, page: p, pages: Math.max(1, Math.ceil(total / limit)) });
});

// Tinjau buku masuk: setujui, tolak (wajib alasan), atau minta revisi.
router.post("/books/:id/review", async (req, res) => {
  if (!isId(req.params.id)) throw new HttpError(404, "Buku tidak ditemukan.");
  const book = await Book.findById(req.params.id);
  if (!book) throw new HttpError(404, "Buku tidak ditemukan.");
  const status = { setujui: "disetujui", tolak: "ditolak", revisi: "revisi", disetujui: "disetujui", ditolak: "ditolak" }[req.body.action || req.body.status];
  if (!status) throw new HttpError(400, "Pilih tindakan: setujui, tolak, atau revisi.");
  const catatan = str(req.body.catatan, 1000);
  if (status !== "disetujui" && !catatan) throw new HttpError(400, "Tuliskan alasan / catatan untuk pengunggah.");
  book.status = status;
  book.catatanReview = catatan;
  book.reviewedBy = req.user._id;
  book.reviewedAt = new Date();
  await book.save();
  res.json({ book });
});

// ---------- Ulasan ----------
router.get("/reviews", async (req, res) => {
  const { page: p, limit, skip } = page(req, { def: 20, max: 100 });
  const filter = {};
  const rating = parseInt(req.query.rating, 10);
  if (rating >= 1 && rating <= 5) filter.rating = rating;
  const [items, total] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate("user", USER_PUBLIC).populate("book", "judul cover"),
    Review.countDocuments(filter),
  ]);
  res.json({ items, total, page: p, pages: Math.max(1, Math.ceil(total / limit)) });
});

router.delete("/reviews/:id", async (req, res) => {
  if (!isId(req.params.id)) throw new HttpError(404, "Ulasan tidak ditemukan.");
  const review = await Review.findByIdAndDelete(req.params.id);
  if (!review) throw new HttpError(404, "Ulasan tidak ditemukan.");
  await recomputeRating(review.book);
  res.json({ ok: true });
});

// ---------- Pengguna ----------
router.get("/users", async (req, res) => {
  const { page: p, limit, skip } = page(req, { def: 20, max: 100 });
  const filter = {};
  if (["user", "admin"].includes(req.query.role)) filter.role = req.query.role;
  const q = str(req.query.q, 100);
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ username: rx }, { email: rx }, { namaLengkap: rx }];
  }
  const [users, total] = await Promise.all([User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit), User.countDocuments(filter)]);
  const ids = users.map((u) => u._id);
  const counts = await Book.aggregate([{ $match: { uploadedBy: { $in: ids } } }, { $group: { _id: "$uploadedBy", n: { $sum: 1 } } }]);
  const map = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
  res.json({ items: users.map((u) => ({ ...u.toSelf(), bukuCount: map[String(u._id)] || 0 })), total, page: p, pages: Math.max(1, Math.ceil(total / limit)) });
});

router.patch("/users/:id/role", async (req, res) => {
  if (!isId(req.params.id)) throw new HttpError(404, "Pengguna tidak ditemukan.");
  const role = req.body.role;
  if (!["user", "admin"].includes(role)) throw new HttpError(400, "Peran harus user atau admin.");
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, "Pengguna tidak ditemukan.");
  if (user.role === "admin" && role === "user" && (await User.countDocuments({ role: "admin" })) <= 1) {
    throw new HttpError(400, "Harus ada minimal satu admin.");
  }
  user.role = role;
  user.tokenVersion = (user.tokenVersion || 0) + 1; // paksa masuk ulang dengan peran baru
  await user.save();
  res.json({ user: user.toSelf() });
});

router.delete("/users/:id", async (req, res) => {
  if (!isId(req.params.id)) throw new HttpError(404, "Pengguna tidak ditemukan.");
  if (String(req.params.id) === String(req.user._id)) throw new HttpError(400, "Tidak bisa menghapus akunmu sendiri dari sini.");
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, "Pengguna tidak ditemukan.");
  if (user.role === "admin" && (await User.countDocuments({ role: "admin" })) <= 1) throw new HttpError(400, "Harus ada minimal satu admin.");
  await deleteUserContent(user._id);
  await user.deleteOne();
  res.json({ ok: true });
});

// ---------- Diskusi (moderasi) ----------
router.delete("/comments/:id", async (req, res) => {
  if (!isId(req.params.id)) throw new HttpError(404, "Balasan tidak ditemukan.");
  const c = await Comment.findByIdAndDelete(req.params.id);
  if (!c) throw new HttpError(404, "Balasan tidak ditemukan.");
  await Discussion.updateOne({ _id: c.discussion }, { $inc: { balasanCount: -1 } });
  res.json({ ok: true });
});

module.exports = router;
