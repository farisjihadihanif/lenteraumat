const express = require("express");
const fs = require("fs");
const Book = require("../models/Book");
const Review = require("../models/Review");
const ReadingProgress = require("../models/ReadingProgress");
const Discussion = require("../models/Discussion");
const { requireAuth, isAdmin, isOwner } = require("../middleware/auth");
const { upload, checkImageSize, isRealPdf } = require("../middleware/upload");
const { HttpError, isId } = require("../middleware/errors");
const storage = require("../services/storage");
const categories = require("../services/categories");
const { storePdf: storePdfBuffer, indexText: indexTextFor } = require("../services/bookFiles");
const { str, page, escapeRegex, USER_PUBLIC } = require("../util");
const { recomputeRating, deleteBook } = require("./cleanup");

const router = express.Router();
const BOOK_TYPE = "application/x-lentera-book";

const LIST_FIELDS = "judul penulis penerbit tahunTerbit kategori cover halaman ratingAvg ratingCount dibaca createdAt status uploadedBy";

// Buku yang belum disetujui hanya bisa dilihat pengunggah & admin.
function canSee(user, book) {
  return book.status === "disetujui" || isAdmin(user) || isOwner(user, book.uploadedBy);
}

async function findVisible(req) {
  if (!isId(req.params.id)) throw new HttpError(404, "Buku tidak ditemukan.");
  const book = await Book.findById(req.params.id);
  if (!book || !canSee(req.user, book)) throw new HttpError(404, "Buku tidak ditemukan.");
  return book;
}

const URL_OK = (v) => !v || /^https?:\/\/[^\s"'<>]+$/.test(v);

async function bookFields(body, { partial = false, createCategory = false } = {}) {
  const out = {};
  const set = (key, value) => {
    if (!partial || key in body) out[key] = value;
  };
  set("judul", str(body.judul, 200));
  set("penulis", str(body.penulis, 150));
  set("penerbit", str(body.penerbit, 150));
  set("isbn", str(body.isbn, 30));
  set("edisi", str(body.edisi, 50));
  set("bahasa", str(body.bahasa, 40) || "Indonesia");
  set("deskripsi", str(body.deskripsi, 3000));
  set("sumber", str(body.sumber, 150));
  set("sumberUrl", str(body.sumberUrl, 500));
  set("lisensi", str(body.lisensi, 150));
  if (!URL_OK(out.sumberUrl)) throw new HttpError(400, "Tautan sumber harus diawali http:// atau https://");
  if (!partial || "tahunTerbit" in body) {
    const y = parseInt(body.tahunTerbit, 10);
    out.tahunTerbit = Number.isFinite(y) ? y : undefined;
  }
  if (!partial || "kategori" in body) out.kategori = await categories.resolve(body.kategori, { create: createCategory });
  if (!partial || "judul" in body) if (!out.judul) throw new HttpError(400, "Judul wajib diisi.");
  if (!partial || "penulis" in body) if (!out.penulis) throw new HttpError(400, "Penulis wajib diisi.");
  return out;
}

const indexText = (book, buffer) => indexTextFor(book._id, buffer);
const storePdf = (file) => storePdfBuffer(file.buffer, file.originalname);

// ---------- Daftar & pencarian ----------
router.get("/", async (req, res) => {
  const { page: p, limit, skip } = page(req, { def: 12, max: 48 });
  const filter = { status: "disetujui" };
  const q = str(req.query.q, 100);
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ judul: rx }, { penulis: rx }, { penerbit: rx }, { isbn: rx }];
  }
  const kategori = str(req.query.kategori, 60);
  if (kategori) filter.kategori = kategori;
  const sort =
    {
      populer: { dibaca: -1, createdAt: -1 },
      rating: { ratingAvg: -1, ratingCount: -1 },
      judul: { judul: 1 },
    }[req.query.sort] || { createdAt: -1 };
  const [items, total] = await Promise.all([
    Book.find(filter).sort(sort).skip(skip).limit(limit).select(LIST_FIELDS).populate("uploadedBy", USER_PUBLIC),
    Book.countDocuments(filter),
  ]);
  res.json({ items, total, page: p, pages: Math.max(1, Math.ceil(total / limit)) });
});

router.get("/categories", async (req, res) => {
  const counts = await Book.aggregate([{ $match: { status: "disetujui" } }, { $group: { _id: "$kategori", n: { $sum: 1 } } }]);
  const map = Object.fromEntries(counts.map((c) => [c._id, c.n]));
  const list = await categories.list();
  res.json({ categories: list.map((c) => ({ _id: c._id, name: c.nama, count: map[c.nama] || 0 })) });
});

router.get("/mine", requireAuth, async (req, res) => {
  const items = await Book.find({ uploadedBy: req.user._id }).sort({ updatedAt: -1 }).select(`${LIST_FIELDS} catatanReview reviewedAt updatedAt`);
  res.json({ items });
});

router.get("/saved", requireAuth, async (req, res) => {
  const items = await Book.find({ disimpan: req.user._id, status: "disetujui" }).sort({ updatedAt: -1 }).select(LIST_FIELDS);
  res.json({ items });
});

router.get("/continue", requireAuth, async (req, res) => {
  const progress = await ReadingProgress.find({ user: req.user._id }).sort({ updatedAt: -1 }).limit(12).populate("book", LIST_FIELDS);
  res.json({
    items: progress.filter((p) => p.book && p.book.status === "disetujui").map((p) => ({ book: p.book, page: p.page, totalPages: p.totalPages, updatedAt: p.updatedAt })),
  });
});

// ---------- Detail ----------
router.get("/:id", async (req, res) => {
  const book = await findVisible(req);
  await book.populate("uploadedBy", USER_PUBLIC);
  const out = book.toObject();
  out.saved = Boolean(req.user && book.disimpan.some((id) => String(id) === String(req.user._id)));
  out.savedCount = book.disimpan.length;
  delete out.disimpan;
  delete out.coverStored;
  out.file = { size: book.file.size };
  out.canEdit = isAdmin(req.user) || isOwner(req.user, book.uploadedBy);
  out.discussionCount = await Discussion.countDocuments({ book: book._id });
  res.json({ book: out });
});

// File PDF disajikan lewat API (bukan link langsung) supaya pembaca flipbook &
// LUMA tidak terkena aturan CORS, dan buku yang belum disetujui tetap terkunci.
router.get("/:id/file", async (req, res) => {
  const book = await findVisible(req);
  // Sengaja BUKAN "application/pdf" dan tanpa nama file: download manager (IDM, FDM, dll)
  // menyergap respons PDF sehingga flipbook & cuplikan gagal. pdf.js tidak peduli tipe ini.
  res.setHeader("Content-Type", BOOK_TYPE);
  res.setHeader("Cache-Control", book.status === "disetujui" ? "public, max-age=86400" : "private, no-store");
  const local = storage.localPath(book.file);
  if (local) {
    if (!fs.existsSync(local)) throw new HttpError(404, "File buku tidak ditemukan di server.");
    return res.sendFile(local, { headers: { "Content-Type": BOOK_TYPE } }, (err) => {
      if (err && !res.headersSent) res.status(err.status || 500).end();
    });
  }
  // Penyimpanan luar (Cloudinary / sumber asli): teruskan Range supaya buku besar
  // tidak perlu diunduh penuh, pdf.js hanya meminta halaman yang dibaca.
  const ctrl = new AbortController();
  res.on("close", () => ctrl.abort());
  const range = /^bytes=\d*-\d*$/.test(req.headers.range || "") ? req.headers.range : "";
  const upstream = await storage.open(book.file, { range, signal: ctrl.signal });
  res.status(upstream.status === 206 ? 206 : 200);
  for (const h of ["content-length", "content-range"]) {
    const v = upstream.headers.get(h);
    if (v) res.setHeader(h, v);
  }
  if (upstream.headers.get("accept-ranges") === "bytes" || upstream.status === 206) res.setHeader("Accept-Ranges", "bytes");
  const { Readable } = require("stream");
  Readable.fromWeb(upstream.body)
    .on("error", () => res.destroy())
    .pipe(res);
});

// ---------- Unggah & ubah ----------
const files = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "cover", maxCount: 1 },
]);

router.post("/", requireAuth, files, checkImageSize("cover"), async (req, res) => {
  const pdf = req.files?.file?.[0];
  if (!pdf) throw new HttpError(400, "File PDF buku wajib diunggah.");
  const data = await bookFields(req.body);
  const { stored, halaman } = await storePdf(pdf);
  let coverStored = null;
  if (req.files?.cover?.[0]) coverStored = await storage.save(req.files.cover[0], "sampul");
  const admin = isAdmin(req.user);
  const book = await Book.create({
    ...data,
    file: stored,
    halaman,
    cover: coverStored?.url || "",
    coverStored: coverStored || undefined,
    uploadedBy: req.user._id,
    // Buku dari admin langsung tayang; dari user menunggu ditinjau.
    status: admin ? "disetujui" : "menunggu",
    ...(admin ? { reviewedBy: req.user._id, reviewedAt: new Date() } : {}),
  });
  indexText(book, pdf.buffer);
  res.status(201).json({ book });
});

router.patch("/:id", requireAuth, files, checkImageSize("cover"), async (req, res) => {
  const book = await findVisible(req);
  const admin = isAdmin(req.user);
  if (!admin && !isOwner(req.user, book.uploadedBy)) throw new HttpError(403, "Kamu tidak bisa mengubah buku ini.");
  Object.assign(book, await bookFields(req.body, { partial: true }));
  const pdf = req.files?.file?.[0];
  if (pdf) {
    const old = book.file;
    const { stored, halaman } = await storePdf(pdf);
    book.file = stored;
    book.halaman = halaman;
    await storage.remove(old);
    indexText(book, pdf.buffer);
  }
  if (req.files?.cover?.[0]) {
    const old = book.coverStored;
    const saved = await storage.save(req.files.cover[0], "sampul");
    book.cover = saved.url;
    book.coverStored = saved;
    if (old?.key) await storage.remove(old);
  }
  // Perubahan oleh pengunggah (bukan admin) perlu ditinjau ulang.
  if (!admin) {
    book.status = "menunggu";
    book.reviewedAt = undefined;
  }
  await book.save();
  res.json({ book });
});

router.delete("/:id", requireAuth, async (req, res) => {
  const book = await findVisible(req);
  if (!isAdmin(req.user) && !isOwner(req.user, book.uploadedBy)) throw new HttpError(403, "Kamu tidak bisa menghapus buku ini.");
  await deleteBook(book);
  res.json({ ok: true });
});

// ---------- Simpan, progres baca ----------
router.post("/:id/save", requireAuth, async (req, res) => {
  const book = await findVisible(req);
  const saved = book.disimpan.some((id) => String(id) === String(req.user._id));
  await Book.updateOne({ _id: book._id }, saved ? { $pull: { disimpan: req.user._id } } : { $addToSet: { disimpan: req.user._id } });
  res.json({ saved: !saved });
});

router.get("/:id/progress", requireAuth, async (req, res) => {
  if (!isId(req.params.id)) throw new HttpError(404, "Buku tidak ditemukan.");
  const p = await ReadingProgress.findOne({ user: req.user._id, book: req.params.id });
  res.json({ page: p?.page || 1, totalPages: p?.totalPages || 0 });
});

router.put("/:id/progress", requireAuth, async (req, res) => {
  const book = await findVisible(req);
  const pg = Math.max(1, Math.min(parseInt(req.body.page, 10) || 1, book.halaman || 100000));
  await ReadingProgress.findOneAndUpdate(
    { user: req.user._id, book: book._id },
    { page: pg, totalPages: book.halaman },
    { upsert: true },
  );
  res.json({ page: pg });
});

// Dihitung sekali saat pembaca membuka flipbook.
router.post("/:id/read", async (req, res) => {
  const book = await findVisible(req);
  if (book.status === "disetujui") await Book.updateOne({ _id: book._id }, { $inc: { dibaca: 1 } });
  res.json({ ok: true });
});

// ---------- Ulasan ----------
router.get("/:id/reviews", async (req, res) => {
  const book = await findVisible(req);
  const { page: p, limit, skip } = page(req, { def: 10, max: 50 });
  const [items, total, dist, mine] = await Promise.all([
    Review.find({ book: book._id }).sort({ createdAt: -1 }).skip(skip).limit(limit).populate("user", USER_PUBLIC),
    Review.countDocuments({ book: book._id }),
    Review.aggregate([{ $match: { book: book._id } }, { $group: { _id: "$rating", n: { $sum: 1 } } }]),
    req.user ? Review.findOne({ book: book._id, user: req.user._id }) : null,
  ]);
  const distribution = [5, 4, 3, 2, 1].map((star) => ({ star, count: dist.find((d) => d._id === star)?.n || 0 }));
  res.json({ items, total, page: p, pages: Math.max(1, Math.ceil(total / limit)), distribution, mine, avg: book.ratingAvg, count: book.ratingCount });
});

router.put("/:id/reviews", requireAuth, async (req, res) => {
  const book = await findVisible(req);
  if (book.status !== "disetujui") throw new HttpError(400, "Buku ini belum tayang.");
  if (isOwner(req.user, book.uploadedBy) && !isAdmin(req.user)) throw new HttpError(400, "Kamu tidak bisa mengulas buku unggahanmu sendiri.");
  const rating = parseInt(req.body.rating, 10);
  if (!(rating >= 1 && rating <= 5)) throw new HttpError(400, "Pilih rating 1 sampai 5 bintang.");
  const review = await Review.findOneAndUpdate(
    { book: book._id, user: req.user._id },
    { rating, komentar: str(req.body.komentar, 2000) },
    { upsert: true, new: true, runValidators: true },
  );
  await recomputeRating(book._id);
  const fresh = await Book.findById(book._id).select("ratingAvg ratingCount");
  res.json({ review, ratingAvg: fresh.ratingAvg, ratingCount: fresh.ratingCount });
});

module.exports = router;
module.exports.bookFields = bookFields;
