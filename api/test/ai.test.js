const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");
const gemini = require("../src/services/gemini");

let app;
let calls = [];
let nextReply = "Jawaban LUMA";
before(async () => {
  app = await h.start();
  gemini.setFetch(async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body), headers: opts.headers });
    const text = typeof nextReply === "function" ? nextReply(JSON.parse(opts.body)) : nextReply;
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
  });
});
after(h.stop);
beforeEach(async () => {
  await h.reset();
  calls = [];
  nextReply = "Jawaban LUMA";
});

const BOOK_PAGES = [
  "Bab satu membahas sabar. Sabar adalah menahan diri dari keluh kesah ketika menghadapi ujian hidup.",
  "Bab dua membahas syukur. Syukur adalah mengakui nikmat Allah dan menggunakannya dalam ketaatan.",
];

async function setup() {
  const admin = await h.makeAdmin(app);
  const user = await h.makeUser(app, "faris");
  const book = (await h.uploadBook(admin, { judul: "Sabar dan Syukur" }, h.makePdf(BOOK_PAGES))).body.book;
  return { admin, user, book };
}

test("status LUMA bisa dicek tanpa masuk dan key tidak bocor", async () => {
  const r = await h.request(app).get("/api/ai/status").expect(200);
  assert.equal(r.body.enabled, true);
  assert.equal(JSON.stringify(r.body).includes("test-key"), false);
  await h.request(app).post("/api/ai/chat").send({ message: "halo" }).expect(401);
});

test("chat biasa membuat sesi dan menyimpan riwayat", async () => {
  const { user } = await setup();
  const r = await user.post("/api/ai/chat").send({ message: "Assalamualaikum LUMA" }).expect(200);
  assert.equal(r.body.reply, "Jawaban LUMA");
  assert.equal(calls[0].headers["x-goog-api-key"], "test-key");
  assert.match(calls[0].url, /gemini-flash-latest:generateContent/);

  await user.post("/api/ai/chat").send({ message: "Lanjut", sessionId: r.body.sessionId }).expect(200);
  // pesan kedua membawa riwayat pesan pertama
  assert.equal(calls[1].body.contents.length, 3);
  const s = await user.get(`/api/ai/sessions/${r.body.sessionId}`).expect(200);
  assert.equal(s.body.session.messages.length, 4);
  assert.equal((await user.get("/api/ai/sessions")).body.items.length, 1);

  const other = await h.makeUser(app, "lain");
  await other.get(`/api/ai/sessions/${r.body.sessionId}`).expect(404);
  await user.patch(`/api/ai/sessions/${r.body.sessionId}`).send({ title: "Salam" }).expect(200);
  await user.delete(`/api/ai/sessions/${r.body.sessionId}`).expect(200);
});

test("tanya isi buku memakai teks PDF yang diekstrak di server", async () => {
  const { user, book } = await setup();
  await h.wait(300);
  await user.post("/api/ai/chat").send({ message: "Apa itu syukur?", bookId: book._id }).expect(200);
  const prompt = calls[0].body.contents[0].parts[0].text;
  assert.match(prompt, /Sabar dan Syukur/);
  assert.match(prompt, /mengakui nikmat Allah/);
  assert.match(prompt, /\[Halaman 2\]/);
});

test("ringkasan buku", async () => {
  const { user, book } = await setup();
  nextReply = "Ringkasan: sabar & syukur.";
  const r = await user.post("/api/ai/summary").send({ bookId: book._id, length: "singkat" }).expect(200);
  assert.equal(r.body.reply, "Ringkasan: sabar & syukur.");
  assert.match(r.body.title, /Ringkasan/);
});

test("kuis pilihan ganda tervalidasi", async () => {
  const { user, book } = await setup();
  nextReply = JSON.stringify({
    questions: [
      { question: "Sabar artinya?", options: ["Menahan diri", "Marah", "Lari", "Tidur"], answer: "Menahan diri", explanation: "Hal. 1" },
      { question: "Soal rusak", options: ["A", "B"], answer: "Z", explanation: "" },
    ],
  });
  const r = await user.post("/api/ai/quiz").send({ bookId: book._id, type: "pilihan", count: 5 }).expect(200);
  assert.equal(r.body.quiz.questions.length, 1);
  assert.equal(calls[0].body.generationConfig.responseMimeType, "application/json");
  const s = await user.get(`/api/ai/sessions/${r.body.sessionId}`);
  assert.equal(s.body.session.messages[1].data.questions.length, 1);
});

test("buku yang belum disetujui tidak bisa dipakai user lain di LUMA", async () => {
  const { user } = await setup();
  const other = await h.makeUser(app, "lain");
  const pending = (await h.uploadBook(other, { judul: "Rahasia" })).body.book;
  await user.post("/api/ai/summary").send({ bookId: pending._id }).expect(404);
  await other.post("/api/ai/summary").send({ bookId: pending._id }).expect(200);
});

test("PDF tanpa teks (hasil scan) memberi pesan jelas", async () => {
  const admin = await h.makeAdmin(app);
  const book = (await h.uploadBook(admin, {}, h.makePdf([""]))).body.book;
  await h.wait(200);
  const r = await admin.post("/api/ai/summary").send({ bookId: book._id }).expect(422);
  assert.match(r.body.message, /scan/);
});
