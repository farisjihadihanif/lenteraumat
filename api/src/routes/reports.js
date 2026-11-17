// Tombol "Laporkan": pengguna melaporkan buku, diskusi, balasan, atau ulasan ke admin.
const express = require("express");
const rateLimit = require("express-rate-limit");
const Report = require("../models/Report");
const Book = require("../models/Book");
const Discussion = require("../models/Discussion");
const Comment = require("../models/Comment");
const Review = require("../models/Review");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { HttpError, isId } = require("../middleware/errors");
const { str, page, USER_PUBLIC } = require("../util");
const { deleteBook, recomputeRating } = require("./cleanup");

const router = express.Router();
const MODELS = { book: Book, discussion: Discussion, comment: Comment, review: Review };
const ALASAN = ["spam", "tidak_pantas", "hak_cipta", "salah_informasi", "lainnya"];

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => String(req.user._id),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Terlalu banyak laporan dalam satu jam. Coba lagi nanti." },
});

router.post("/", requireAuth, limiter, async (req, res) => {
  const { targetType, target } = req.body || {};
  const alasan = String(req.body?.alasan || "");
  if (!MODELS[targetType] || !isId(target)) throw new HttpError(400, "Konten yang dilaporkan tidak valid.");
  if (!ALASAN.includes(alasan)) throw new HttpError(400, "Pilih alasan laporan.");
  const catatan = str(req.body.catatan, 1000);
  if (alasan === "lainnya" && catatan.length < 5) throw new HttpError(400, "Jelaskan singkat alasannya.");
  if (!(await MODELS[targetType].exists({ _id: target }))) throw new HttpError(404, "Konten itu sudah tidak ada.");
  // Satu laporan terbuka per orang per konten.
  const open = await Report.findOne({ targetType, target, reporter: req.user._id, status: "baru" });
  if (open) return res.json({ ok: true, message: "Kamu sudah melaporkan ini. Admin akan meninjaunya." });
  await Report.create({ targetType, target, reporter: req.user._id, alasan, catatan });
  res.status(201).json({ ok: true, message: "Laporan terkirim. Terima kasih, admin akan meninjaunya." });
});

// ===== Admin =====
async function describe(r) {
  const o = r.toObject();
  let t = null;
  if (r.targetType === "book") {
    const b = await Book.findById(r.target).select("judul penulis");
    if (b) t = { title: b.judul, sub: b.penulis, link: `/buku/${b._id}` };
  } else if (r.targetType === "discussion") {
    const d = await Discussion.findById(r.target).select("judul isi").populate("author", USER_PUBLIC);
    if (d) t = { title: d.judul, sub: d.isi?.slice(0, 160), author: d.author, link: `/diskusi/${d._id}` };
  } else if (r.targetType === "comment") {
    const c = await Comment.findById(r.target).select("isi discussion").populate("author", USER_PUBLIC);
    if (c) t = { title: "Balasan diskusi", sub: c.isi?.slice(0, 200), author: c.author, link: `/diskusi/${c.discussion}` };
  } else if (r.targetType === "review") {
    const v = await Review.findById(r.target).select("komentar rating book").populate("user", USER_PUBLIC);
    if (v) t = { title: `Ulasan ${v.rating}★`, sub: (v.komentar || "").slice(0, 200), author: v.user, link: `/buku/${v.book}` };
  }
  o.targetInfo = t;
  return o;
}

router.get("/", requireAdmin, async (req, res) => {
  const status = ["baru", "selesai", "diabaikan"].includes(req.query.status) ? req.query.status : "baru";
  const { skip, limit, page: pageNum } = page(req, { def: 20 });
  const [items, total] = await Promise.all([
    Report.find({ status }).sort({ createdAt: -1 }).skip(skip).limit(limit).populate("reporter", USER_PUBLIC),
    Report.countDocuments({ status }),
  ]);
  res.json({ items: await Promise.all(items.map(describe)), total, page: pageNum, pages: Math.max(1, Math.ceil(total / limit)) });
});

router.patch("/:id", requireAdmin, async (req, res) => {
  if (!isId(req.params.id)) throw new HttpError(404, "Laporan tidak ditemukan.");
  const status = String(req.body?.status || "");
  if (!["baru", "selesai", "diabaikan"].includes(status)) throw new HttpError(400, "Status tidak valid.");
  const r = await Report.findByIdAndUpdate(req.params.id, { status, handledBy: req.user._id }, { new: true });
  if (!r) throw new HttpError(404, "Laporan tidak ditemukan.");
  res.json({ ok: true });
});

// Hapus konten yang dilaporkan; semua laporan untuk konten itu ditandai selesai.
router.post("/:id/remove-content", requireAdmin, async (req, res) => {
  if (!isId(req.params.id)) throw new HttpError(404, "Laporan tidak ditemukan.");
  const r = await Report.findById(req.params.id);
  if (!r) throw new HttpError(404, "Laporan tidak ditemukan.");
  const Model = MODELS[r.targetType];
  const doc = await Model.findById(r.target);
  if (doc) {
    if (r.targetType === "book") await deleteBook(doc);
    else if (r.targetType === "discussion") {
      await Comment.deleteMany({ discussion: doc._id });
      await doc.deleteOne();
    } else if (r.targetType === "comment") {
      await doc.deleteOne();
      await Discussion.updateOne({ _id: doc.discussion }, { $inc: { balasanCount: -1 } });
    } else {
      await doc.deleteOne();
      await recomputeRating(doc.book);
    }
  }
  await Report.updateMany({ targetType: r.targetType, target: r.target, status: "baru" }, { status: "selesai", handledBy: req.user._id });
  res.json({ ok: true });
});

module.exports = router;
