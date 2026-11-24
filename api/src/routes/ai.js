// LUMA AI: chat, tanya isi buku, ringkasan, dan kuis. Semua lewat server.
const express = require("express");
const rateLimit = require("express-rate-limit");
const config = require("../config");
const Book = require("../models/Book");
const BookText = require("../models/BookText");
const ChatSession = require("../models/ChatSession");
const { requireAuth, isAdmin, isOwner } = require("../middleware/auth");
const { HttpError, isId } = require("../middleware/errors");
const storage = require("../services/storage");
const { extractText } = require("../services/pdfText");
const gemini = require("../services/gemini");
const { checkQuota, usage } = require("../services/quota");
const { str } = require("../util");
const multer = require("multer");

// Lampiran untuk LUMA: gambar, PDF/teks, audio, video.
const ATTACH_TYPES = /^(image\/(png|jpe?g|webp|heic|heif|gif)|application\/pdf|text\/(plain|markdown|csv)|video\/(mp4|mpeg|quicktime|webm|x-msvideo|3gpp|x-flv|x-ms-wmv)|audio\/(mpeg|mp3|wav|x-wav|ogg|aac|flac|webm|x-m4a|mp4|aiff))$/;
const MAX_ATTACH_MB = config.lumaAttachMb;
const attachUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACH_MB * 1024 * 1024, files: 4 },
  fileFilter(req, file, cb) {
    if (ATTACH_TYPES.test(file.mimetype)) return cb(null, true);
    if (/word|officedocument|msword|presentation|spreadsheet/.test(file.mimetype)) {
      return cb(new HttpError(400, `${file.originalname}: dokumen Word/PowerPoint/Excel belum didukung. Simpan sebagai PDF dulu.`));
    }
    cb(new HttpError(400, `${file.originalname}: jenis file ini belum didukung LUMA.`));
  },
});
function withAttachments(req, res, next) {
  if (!req.is("multipart/form-data")) return next();
  attachUpload.array("lampiran", 4)(req, res, (err) => {
    if (err?.code === "LIMIT_FILE_SIZE") return next(new HttpError(400, `Ukuran lampiran maksimal ${MAX_ATTACH_MB} MB per file.`));
    if (err?.code === "LIMIT_FILE_COUNT") return next(new HttpError(400, "Maksimal 4 lampiran sekali kirim."));
    if (!err && config.onVercel && (req.files || []).reduce((n, f) => n + f.size, 0) > MAX_ATTACH_MB * 1024 * 1024) {
      return next(new HttpError(400, `Total lampiran maksimal ${MAX_ATTACH_MB} MB sekali kirim.`));
    }
    next(err);
  });
}

const router = express.Router();

router.get("/status", (req, res) => {
  res.json({ enabled: Boolean(config.geminiApiKey), model: config.geminiModel, maxAttachMb: MAX_ATTACH_MB, maxAttachTotalMb: config.onVercel ? MAX_ATTACH_MB : null });
});

router.use(requireAuth);
router.use((req, res, next) => {
  req.deadline = Date.now() + config.lumaBudgetMs;
  next();
});
const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 15,
  keyGenerator: (req) => String(req.user._id),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Pelan-pelan ya, LUMA butuh jeda sebentar. Coba lagi dalam 1 menit." },
});

// Sisa jatah LUMA hari ini (null = tanpa batas).
router.get("/usage", async (req, res) => {
  res.json(await usage(req.user));
});

const CONTEXT_CHARS = 300000;
const HISTORY = 20;

async function loadBook(id, user) {
  if (!isId(id)) throw new HttpError(404, "Buku tidak ditemukan.");
  const book = await Book.findById(id).select("judul penulis status uploadedBy file halaman");
  if (!book || !(book.status === "disetujui" || isAdmin(user) || isOwner(user, book.uploadedBy))) {
    throw new HttpError(404, "Buku tidak ditemukan.");
  }
  return book;
}

// Buku dari Internet Archive sudah punya teks OCR (_djvu.txt), jauh lebih ringan dari PDF-nya.
async function archiveText(file, timeoutMs) {
  const m = /^https:\/\/archive\.org\/download\/(.+)\.pdf$/i.exec(file?.url || "");
  if (!m) return null;
  try {
    const res = await fetch(`https://archive.org/download/${m[1]}_djvu.txt`, { signal: AbortSignal.timeout(timeoutMs), headers: { "User-Agent": "LenteraUmat/2.0" } });
    if (!res.ok) return null;
    const text = (await res.text()).slice(0, 400000);
    return text.trim().length > 50 ? { text, pages: 0 } : null;
  } catch {
    return null;
  }
}

// Teks buku diekstrak sekali lalu disimpan; kalau belum ada, ekstrak sekarang.
// Sisakan waktu untuk Gemini setelah PDF diambil dan dibaca.
const GEMINI_RESERVE = 45 * 1000;

async function bookText(book, deadline) {
  const left = (cap) => Math.max(1000, Math.min(cap, deadline - GEMINI_RESERVE - Date.now()));
  const slow = () => new HttpError(504, "Buku ini terlalu lama diambil atau dibaca. Coba lagi nanti.");
  let doc = await BookText.findOne({ book: book._id });
  if (!doc || (!doc.text && !doc.error)) {
    let result = await archiveText(book.file, left(config.onVercel ? 30 * 1000 : 60 * 1000));
    if (!result) {
      // Gagal mengambil file (jaringan / terlalu besar) tidak disimpan, supaya bisa dicoba lagi nanti.
      const buffer = await storage.read(book.file, { maxMb: 150, timeoutMs: left(5 * 60 * 1000) }).catch((e) => {
        throw e?.name === "TimeoutError" ? slow() : e;
      });
      // Situs sumber kadang membalas halaman HTML (pemeliharaan, verifikasi bot) dengan status 200.
      if (buffer.subarray(0, 1024).indexOf("%PDF-") === -1) throw new HttpError(502, "Sumber buku sedang tidak mengirimkan file PDF. Coba lagi nanti.");
      try {
        result = await extractText(buffer, left(5 * 60 * 1000));
      } catch (error) {
        if (error.code === "PDF_TIMEOUT") throw slow(); // jangan disimpan sebagai gagal permanen
        result = { text: "", pages: 0, error: error.message };
      }
    }
    doc = await BookText.findOneAndUpdate({ book: book._id }, { text: result.text, pages: result.pages, error: result.error || "" }, { upsert: true, new: true });
  }
  if (!doc.text || doc.text.replace(/\[Halaman \d+\]/g, "").trim().length < 50) {
    throw new HttpError(422, "Teks buku ini tidak bisa dibaca LUMA (mungkin berupa hasil scan/gambar).");
  }
  return doc.text.slice(0, CONTEXT_CHARS);
}

function bookPrompt(book, text) {
  return `Berikut isi buku "${book.judul}" karya ${book.penulis}:\n"""\n${text}\n"""`;
}

async function getSession(user, id, { book, title } = {}) {
  if (id) {
    if (!isId(id)) throw new HttpError(404, "Percakapan tidak ditemukan.");
    const s = await ChatSession.findOne({ _id: id, user: user._id });
    if (!s) throw new HttpError(404, "Percakapan tidak ditemukan.");
    return s;
  }
  return new ChatSession({ user: user._id, book: book?._id, title: (title || "Percakapan baru").slice(0, 80) });
}

// Riwayat percakapan untuk Gemini; lampiran yang masih berlaku ikut dikirim ulang.
const history = (session) =>
  session.messages.slice(-HISTORY).map((m) => {
    const parts = [];
    const fresh = Date.now() + 5 * 60 * 1000;
    for (const f of m.lampiran || []) {
      if (f.uri && (!f.expiresAt || new Date(f.expiresAt).getTime() > fresh)) parts.push({ fileData: { mimeType: f.mimeType, fileUri: f.uri } });
      else parts.push({ text: `[lampiran "${f.name}" sudah tidak tersedia]` });
    }
    parts.push({ text: m.kind === "quiz" ? "[kuis dibuat]" : m.content || "(lampiran)" });
    return { role: m.role, parts };
  });

// ---------- Sesi ----------
router.get("/sessions", async (req, res) => {
  const items = await ChatSession.find({ user: req.user._id }).sort({ updatedAt: -1 }).limit(100).select("title book updatedAt").populate("book", "judul cover");
  res.json({ items });
});

router.get("/sessions/:id", async (req, res) => {
  const s = await getSession(req.user, req.params.id);
  await s.populate("book", "judul cover penulis");
  res.json({ session: s });
});

router.patch("/sessions/:id", async (req, res) => {
  const s = await getSession(req.user, req.params.id);
  const title = str(req.body.title, 80);
  if (!title) throw new HttpError(400, "Judul tidak boleh kosong.");
  s.title = title;
  await s.save();
  res.json({ session: { _id: s._id, title: s.title } });
});

router.delete("/sessions/:id", async (req, res) => {
  const s = await getSession(req.user, req.params.id);
  await s.deleteOne();
  res.json({ ok: true });
});

// ---------- Chat (bisa dengan konteks buku) ----------
router.post("/chat", limiter, checkQuota, withAttachments, async (req, res) => {
  const files = req.files || [];
  let message = str(req.body.message, 4000);
  if (!message && !files.length) throw new HttpError(400, "Tulis pertanyaanmu dulu.");
  if (!message) message = files.length > 1 ? "Tolong jelaskan lampiran-lampiran ini." : "Tolong jelaskan lampiran ini.";
  const book = req.body.bookId ? await loadBook(req.body.bookId, req.user) : null;
  const session = await getSession(req.user, req.body.sessionId, { book, title: str(req.body.message, 80) || files[0]?.originalname || "Lampiran" });
  if (book) session.book = book._id;

  const lampiran = [];
  for (const f of files) {
    const up = await gemini.uploadFile(f.buffer, f.mimetype, f.originalname, { deadline: req.deadline });
    lampiran.push({ name: f.originalname.slice(0, 120), mimeType: up.mimeType, size: f.size, uri: up.uri, expiresAt: up.expiresAt ? new Date(up.expiresAt) : undefined });
  }

  const contents = [];
  if (session.book) {
    const b = book || (await loadBook(session.book, req.user));
    contents.push({ role: "user", parts: [{ text: bookPrompt(b, await bookText(b, req.deadline)) }] });
    contents.push({ role: "model", parts: [{ text: `Sudah kubaca buku "${b.judul}". Silakan tanya.` }] });
  }
  contents.push(...history(session), {
    role: "user",
    parts: [...lampiran.map((f) => ({ fileData: { mimeType: f.mimeType, fileUri: f.uri } })), { text: message }],
  });

  const reply = await gemini.generate(contents, { user: req.user, deadline: req.deadline });
  session.messages.push({ role: "user", content: message, kind: session.book ? "ask" : "chat", lampiran });
  session.messages.push({ role: "model", content: reply, kind: session.book ? "ask" : "chat" });
  await session.save();
  res.json({ sessionId: session._id, title: session.title, reply, lampiran: lampiran.map(({ name, mimeType, size }) => ({ name, mimeType, size })) });
});

// ---------- Ringkasan ----------
router.post("/summary", limiter, checkQuota, async (req, res) => {
  const book = await loadBook(req.body.bookId, req.user);
  const panjang = { singkat: "sekitar 5 poin penting", sedang: "sekitar 3–5 paragraf dengan poin-poin utama tiap bab", lengkap: "ringkasan per bab yang lengkap" }[req.body.length] || "sekitar 3–5 paragraf dengan poin-poin utama tiap bab";
  const text = await bookText(book, req.deadline);
  const reply = await gemini.generate(
    [{ role: "user", parts: [{ text: `${bookPrompt(book, text)}\n\nBuat ringkasan buku ini (${panjang}). Awali dengan satu kalimat gambaran umum, lalu poin-poin utama, dan akhiri dengan pelajaran yang bisa diambil.` }] }],
    { temperature: 0.4, user: req.user, deadline: req.deadline },
  );
  const session = await getSession(req.user, req.body.sessionId, { book, title: `Ringkasan: ${book.judul}` });
  session.book = book._id;
  session.messages.push({ role: "user", content: `Ringkas buku "${book.judul}"`, kind: "summary" });
  session.messages.push({ role: "model", content: reply, kind: "summary" });
  await session.save();
  res.json({ sessionId: session._id, title: session.title, reply });
});

// ---------- Kuis ----------
// untuk "latihan": dikerjakan sendiri & dinilai otomatis.
// untuk "guru": lembar soal + kunci jawaban & pembahasan (bisa dicetak / diposting ke Discussion).
const QUIZ_SCHEMA = {
  type: "OBJECT",
  properties: {
    questions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          type: { type: "STRING", enum: ["pilihan", "isian", "esai"] },
          question: { type: "STRING" },
          options: { type: "ARRAY", items: { type: "STRING" } },
          answer: { type: "STRING" },
          explanation: { type: "STRING" },
        },
        required: ["type", "question", "answer", "explanation"],
      },
    },
  },
  required: ["questions"],
};

const TYPE_LABEL = { pilihan: "pilihan ganda", isian: "isian singkat", esai: "esai/uraian", campuran: "campuran (pilihan ganda, isian, dan esai)" };

router.post("/quiz", limiter, checkQuota, async (req, res) => {
  const untuk = req.body.untuk === "guru" ? "guru" : "latihan";
  const book = req.body.bookId ? await loadBook(req.body.bookId, req.user) : null;
  const topik = str(req.body.topik, 300);
  if (!book && !topik) throw new HttpError(400, "Pilih buku atau tulis topik kuisnya.");
  const allowed = untuk === "guru" ? ["pilihan", "isian", "esai", "campuran"] : ["pilihan", "isian"];
  let type = req.body.type === "fillInTheBlank" ? "isian" : req.body.type;
  if (!allowed.includes(type)) type = "pilihan";
  const count = Math.min(untuk === "guru" ? 30 : 15, Math.max(3, parseInt(req.body.count, 10) || 5));
  const level = { mudah: "mudah", sedang: "sedang", sulit: "sulit" }[req.body.level] || "sedang";
  const jenjang = str(req.body.jenjang, 80);

  const sumber = book ? `${bookPrompt(book, await bookText(book, req.deadline))}\n\nSoal harus berdasarkan isi buku di atas.` : `Topik: ${topik}`;
  const aturan = [
    `Buat ${count} soal ${TYPE_LABEL[type]} tingkat ${level}${jenjang ? ` untuk ${jenjang}` : ""}.`,
    "Pilihan ganda: tepat 4 pilihan di \"options\" tanpa awalan huruf, dan \"answer\" sama persis dengan salah satu pilihan. Pengecoh harus masuk akal, bukan asal salah.",
    "Isian: tandai bagian kosong dengan \"____\", \"options\" kosong, \"answer\" 1–4 kata.",
    "Esai: \"options\" kosong, \"answer\" berisi poin-poin jawaban yang diharapkan (pedoman penilaian).",
    `"explanation": pembahasan singkat${book ? " dengan rujukan halaman bila ada" : ""}.`,
    "Variasikan tingkat berpikir (mengingat, memahami, menerapkan, menganalisis). Hindari soal yang jawabannya tersirat di soal lain.",
  ].join("\n");
  const raw = await gemini.generate([{ role: "user", parts: [{ text: `${sumber}\n\n${aturan}` }] }], { json: QUIZ_SCHEMA, temperature: 0.5, user: req.user, deadline: req.deadline });
  let questions;
  try {
    questions = JSON.parse(raw).questions;
  } catch {
    throw new HttpError(502, "LUMA gagal menyusun kuis. Coba lagi.");
  }
  questions = (questions || [])
    .filter((q) => q?.question && q?.answer)
    .map((q) => {
      const t = type === "campuran" ? (["pilihan", "isian", "esai"].includes(q.type) ? q.type : "pilihan") : type;
      return {
        type: t,
        question: String(q.question),
        options: t === "pilihan" ? (q.options || []).map((o) => String(o).replace(/^[A-Ea-e][.)]\s+/, "")).slice(0, 4) : [],
        answer: String(q.answer).replace(/^[A-Ea-e][.)]\s+/, ""),
        explanation: String(q.explanation || ""),
      };
    })
    .filter((q) => q.type !== "pilihan" || (q.options.length >= 2 && q.options.includes(q.answer)));
  if (!questions.length) throw new HttpError(502, "LUMA gagal menyusun kuis. Coba lagi.");
  const judul = book ? book.judul : topik;
  const quiz = { untuk, type, level, jenjang, topik, book: book ? { _id: book._id, judul: book.judul } : null, judul, questions };

  const session = await getSession(req.user, req.body.sessionId, { book, title: `${untuk === "guru" ? "Soal" : "Kuis"}: ${judul}` });
  if (book) session.book = book._id;
  session.messages.push({ role: "user", content: `Buat ${count} soal ${TYPE_LABEL[type]} (${level}) ${untuk === "guru" ? "beserta kunci jawaban " : ""}tentang "${judul}"`, kind: "quiz" });
  session.messages.push({ role: "model", content: `${untuk === "guru" ? "Lembar soal" : "Kuis"} ${questions.length} soal: ${judul}`, kind: "quiz", data: quiz });
  await session.save();
  res.json({ sessionId: session._id, title: session.title, quiz });
});

module.exports = router;
