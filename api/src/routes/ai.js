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
const { str } = require("../util");

const router = express.Router();

router.get("/status", (req, res) => {
  res.json({ enabled: Boolean(config.geminiApiKey), model: config.geminiModel });
});

router.use(requireAuth);
const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 15,
  keyGenerator: (req) => String(req.user._id),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Pelan-pelan ya, LUMA butuh jeda sebentar. Coba lagi dalam 1 menit." },
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

// Teks buku diekstrak sekali lalu disimpan; kalau belum ada, ekstrak sekarang.
async function bookText(book) {
  let doc = await BookText.findOne({ book: book._id });
  if (!doc || (!doc.text && !doc.error)) {
    try {
      const buffer = await storage.read(book.file);
      const { text, pages } = await extractText(buffer);
      doc = await BookText.findOneAndUpdate({ book: book._id }, { text, pages, error: "" }, { upsert: true, new: true });
    } catch (error) {
      doc = await BookText.findOneAndUpdate({ book: book._id }, { text: "", error: error.message }, { upsert: true, new: true });
    }
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

const history = (session) =>
  session.messages.slice(-HISTORY).map((m) => ({ role: m.role, parts: [{ text: m.kind === "quiz" ? "[kuis dibuat]" : m.content }] }));

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
router.post("/chat", limiter, async (req, res) => {
  const message = str(req.body.message, 4000);
  if (!message) throw new HttpError(400, "Tulis pertanyaanmu dulu.");
  const book = req.body.bookId ? await loadBook(req.body.bookId, req.user) : null;
  const session = await getSession(req.user, req.body.sessionId, { book, title: message });
  if (book) session.book = book._id;

  const contents = [];
  if (session.book) {
    const b = book || (await loadBook(session.book, req.user));
    contents.push({ role: "user", parts: [{ text: bookPrompt(b, await bookText(b)) }] });
    contents.push({ role: "model", parts: [{ text: `Baik, aku sudah membaca buku "${b.judul}". Silakan bertanya.` }] });
  }
  contents.push(...history(session), { role: "user", parts: [{ text: message }] });

  const reply = await gemini.generate(contents);
  session.messages.push({ role: "user", content: message, kind: session.book ? "ask" : "chat" });
  session.messages.push({ role: "model", content: reply, kind: session.book ? "ask" : "chat" });
  await session.save();
  res.json({ sessionId: session._id, title: session.title, reply });
});

// ---------- Ringkasan ----------
router.post("/summary", limiter, async (req, res) => {
  const book = await loadBook(req.body.bookId, req.user);
  const panjang = { singkat: "sekitar 5 poin penting", sedang: "sekitar 3–5 paragraf dengan poin-poin utama tiap bab", lengkap: "ringkasan per bab yang lengkap" }[req.body.length] || "sekitar 3–5 paragraf dengan poin-poin utama tiap bab";
  const text = await bookText(book);
  const reply = await gemini.generate(
    [{ role: "user", parts: [{ text: `${bookPrompt(book, text)}\n\nBuat ringkasan buku ini (${panjang}). Awali dengan satu kalimat gambaran umum, lalu poin-poin utama, dan akhiri dengan pelajaran yang bisa diambil.` }] }],
    { temperature: 0.4 },
  );
  const session = await getSession(req.user, req.body.sessionId, { book, title: `Ringkasan: ${book.judul}` });
  session.book = book._id;
  session.messages.push({ role: "user", content: `Ringkas buku "${book.judul}"`, kind: "summary" });
  session.messages.push({ role: "model", content: reply, kind: "summary" });
  await session.save();
  res.json({ sessionId: session._id, title: session.title, reply });
});

// ---------- Kuis ----------
const QUIZ_SCHEMA = {
  type: "OBJECT",
  properties: {
    questions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          question: { type: "STRING" },
          options: { type: "ARRAY", items: { type: "STRING" } },
          answer: { type: "STRING" },
          explanation: { type: "STRING" },
        },
        required: ["question", "answer", "explanation"],
      },
    },
  },
  required: ["questions"],
};

router.post("/quiz", limiter, async (req, res) => {
  const book = await loadBook(req.body.bookId, req.user);
  const type = req.body.type === "isian" || req.body.type === "fillInTheBlank" ? "isian" : "pilihan";
  const count = Math.min(15, Math.max(3, parseInt(req.body.count, 10) || 5));
  const level = { mudah: "mudah", sedang: "sedang", sulit: "sulit" }[req.body.level] || "sedang";
  const text = await bookText(book);
  const instruksi =
    type === "pilihan"
      ? `Buat ${count} soal pilihan ganda tingkat ${level} dari isi buku. Setiap soal punya tepat 4 pilihan di "options", dan "answer" harus sama persis dengan salah satu pilihan.`
      : `Buat ${count} soal isian singkat tingkat ${level} dari isi buku. Tandai bagian kosong dengan "____". "options" dikosongkan, "answer" berisi jawaban singkat (1–4 kata).`;
  const raw = await gemini.generate(
    [{ role: "user", parts: [{ text: `${bookPrompt(book, text)}\n\n${instruksi} Sertakan "explanation" singkat dengan rujukan halaman bila ada.` }] }],
    { json: QUIZ_SCHEMA, temperature: 0.5 },
  );
  let questions;
  try {
    questions = JSON.parse(raw).questions;
  } catch {
    throw new HttpError(502, "LUMA gagal menyusun kuis. Coba lagi.");
  }
  questions = (questions || [])
    .filter((q) => q?.question && q?.answer)
    .map((q) => ({
      question: String(q.question),
      options: type === "pilihan" ? (q.options || []).map(String).slice(0, 4) : [],
      answer: String(q.answer),
      explanation: String(q.explanation || ""),
    }))
    .filter((q) => type !== "pilihan" || (q.options.length >= 2 && q.options.includes(q.answer)));
  if (!questions.length) throw new HttpError(502, "LUMA gagal menyusun kuis. Coba lagi.");
  const quiz = { type, level, book: { _id: book._id, judul: book.judul }, questions };

  const session = await getSession(req.user, req.body.sessionId, { book, title: `Kuis: ${book.judul}` });
  session.book = book._id;
  session.messages.push({ role: "user", content: `Buat ${count} soal ${type === "pilihan" ? "pilihan ganda" : "isian"} (${level}) dari "${book.judul}"`, kind: "quiz" });
  session.messages.push({ role: "model", content: `Kuis ${questions.length} soal dari "${book.judul}"`, kind: "quiz", data: quiz });
  await session.save();
  res.json({ sessionId: session._id, title: session.title, quiz });
});

module.exports = router;
