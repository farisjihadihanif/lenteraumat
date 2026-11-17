const express = require("express");
const Discussion = require("../models/Discussion");
const Comment = require("../models/Comment");
const Book = require("../models/Book");
const { requireAuth, isAdmin, isOwner } = require("../middleware/auth");
const { upload, checkImageSize } = require("../middleware/upload");
const { HttpError, isId } = require("../middleware/errors");
const storage = require("../services/storage");
const { str, page, escapeRegex, USER_PUBLIC } = require("../util");

const router = express.Router();

async function recalcScore(id) {
  await Discussion.updateOne({ _id: id }, [
    { $set: { skor: { $add: [{ $multiply: ["$likeCount", 2] }, { $multiply: ["$balasanCount", 3] }, { $multiply: ["$repostCount", 4] }] } } },
  ]);
}

// Bentuk data untuk kartu (tanpa daftar user yang suka/repost).
function card(d, user) {
  const o = d.toObject ? d.toObject() : d;
  const me = user ? String(user._id) : "";
  o.likedByMe = Boolean(me && (o.likes || []).some((id) => String(id._id || id) === me));
  o.repostedByMe = Boolean(me && (o.reposts || []).some((id) => String(id._id || id) === me));
  delete o.likes;
  delete o.reposts;
  return o;
}

async function findDiscussion(id) {
  if (!isId(id)) throw new HttpError(404, "Diskusi tidak ditemukan.");
  const d = await Discussion.findById(id);
  if (!d) throw new HttpError(404, "Diskusi tidak ditemukan.");
  return d;
}

async function validBook(id) {
  if (!id) return undefined;
  if (!isId(id)) throw new HttpError(400, "Buku tidak valid.");
  const book = await Book.findOne({ _id: id, status: "disetujui" }).select("_id");
  if (!book) throw new HttpError(400, "Buku yang dikaitkan tidak ditemukan.");
  return book._id;
}

router.get("/", async (req, res) => {
  const { page: p, limit, skip } = page(req, { def: 12, max: 50 });
  const filter = {};
  if (req.query.book && isId(req.query.book)) filter.book = req.query.book;
  const q = str(req.query.q, 100);
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ judul: rx }, { isi: rx }];
  }
  const sort =
    req.query.sort === "aktif"
      ? { lastActivityAt: -1 }
      : req.query.sort === "hot" || req.query.sort === "ramai"
        ? { skor: -1, lastActivityAt: -1 }
        : { createdAt: -1 };
  const [items, total] = await Promise.all([
    Discussion.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate("author", USER_PUBLIC)
      .populate("lastRepostBy", USER_PUBLIC)
      .populate("book", "judul cover penulis"),
    Discussion.countDocuments(filter),
  ]);
  // Cuplikan pendek untuk daftar.
  const list = items.map((d) => {
    const o = card(d, req.user);
    o.cuplikan = String(o.isi).replace(/[#*_>`]/g, "").replace(/\s+/g, " ").trim().slice(0, 280);
    o.terpotong = String(o.isi).length > 280;
    delete o.isi;
    return o;
  });
  res.json({ items: list, total, page: p, pages: Math.max(1, Math.ceil(total / limit)) });
});

router.get("/:id", async (req, res) => {
  const d = await findDiscussion(req.params.id);
  await d.populate("author", USER_PUBLIC);
  await d.populate("book", "judul cover penulis ratingAvg");
  const comments = await Comment.find({ discussion: d._id }).sort({ createdAt: 1 }).limit(500).populate("author", USER_PUBLIC);
  const out = card(d, req.user);
  out.canEdit = isAdmin(req.user) || isOwner(req.user, d.author);
  res.json({ discussion: out, comments });
});

router.post("/", requireAuth, upload.single("gambar"), checkImageSize("gambar"), async (req, res) => {
  const judul = str(req.body.judul, 200);
  const isi = str(req.body.isi, 20000);
  if (!judul) throw new HttpError(400, "Judul diskusi wajib diisi.");
  if (isi.length < 10) throw new HttpError(400, "Isi diskusi minimal 10 karakter.");
  const book = await validBook(req.body.book);
  let cover = "";
  if (req.file) cover = (await storage.save(req.file, "diskusi")).url;
  const d = await Discussion.create({ judul, isi, book, cover, author: req.user._id });
  res.status(201).json({ discussion: d });
});

router.patch("/:id", requireAuth, upload.single("gambar"), checkImageSize("gambar"), async (req, res) => {
  const d = await findDiscussion(req.params.id);
  if (!isAdmin(req.user) && !isOwner(req.user, d.author)) throw new HttpError(403, "Kamu tidak bisa mengubah diskusi ini.");
  if ("judul" in req.body) {
    d.judul = str(req.body.judul, 200);
    if (!d.judul) throw new HttpError(400, "Judul diskusi wajib diisi.");
  }
  if ("isi" in req.body) {
    d.isi = str(req.body.isi, 20000);
    if (d.isi.length < 10) throw new HttpError(400, "Isi diskusi minimal 10 karakter.");
  }
  if ("book" in req.body) d.book = await validBook(req.body.book);
  if (req.file) d.cover = (await storage.save(req.file, "diskusi")).url;
  await d.save();
  res.json({ discussion: d });
});

router.delete("/:id", requireAuth, async (req, res) => {
  const d = await findDiscussion(req.params.id);
  if (!isAdmin(req.user) && !isOwner(req.user, d.author)) throw new HttpError(403, "Kamu tidak bisa menghapus diskusi ini.");
  await Comment.deleteMany({ discussion: d._id });
  await d.deleteOne();
  res.json({ ok: true });
});

router.post("/:id/comments", requireAuth, async (req, res) => {
  const d = await findDiscussion(req.params.id);
  const isi = str(req.body.isi, 5000);
  if (!isi) throw new HttpError(400, "Balasan tidak boleh kosong.");
  const c = await Comment.create({ discussion: d._id, author: req.user._id, isi });
  await Discussion.updateOne({ _id: d._id }, { $inc: { balasanCount: 1 }, lastActivityAt: new Date() });
  await recalcScore(d._id);
  await c.populate("author", USER_PUBLIC);
  res.status(201).json({ comment: c });
});

router.delete("/:id/comments/:commentId", requireAuth, async (req, res) => {
  if (!isId(req.params.commentId)) throw new HttpError(404, "Balasan tidak ditemukan.");
  const c = await Comment.findOne({ _id: req.params.commentId, discussion: req.params.id });
  if (!c) throw new HttpError(404, "Balasan tidak ditemukan.");
  if (!isAdmin(req.user) && !isOwner(req.user, c.author)) throw new HttpError(403, "Kamu tidak bisa menghapus balasan ini.");
  await c.deleteOne();
  await Discussion.updateOne({ _id: c.discussion }, { $inc: { balasanCount: -1 } });
  await recalcScore(c.discussion);
  res.json({ ok: true });
});

// Suka & repost (tekan sekali lagi untuk membatalkan).
async function toggle(req, res, field, countField) {
  const d = await findDiscussion(req.params.id);
  const me = req.user._id;
  const has = d[field].some((id) => String(id) === String(me));
  const update = has ? { $pull: { [field]: me }, $inc: { [countField]: -1 } } : { $addToSet: { [field]: me }, $inc: { [countField]: 1 } };
  if (field === "reposts" && !has) Object.assign(update, { lastRepostBy: me, lastActivityAt: new Date() });
  const fresh = await Discussion.findOneAndUpdate({ _id: d._id }, update, { new: true });
  await recalcScore(d._id);
  return res.json({ active: !has, count: fresh[countField] });
}

router.post("/:id/like", requireAuth, (req, res) => toggle(req, res, "likes", "likeCount"));
router.post("/:id/repost", requireAuth, (req, res) => toggle(req, res, "reposts", "repostCount"));

module.exports = router;
