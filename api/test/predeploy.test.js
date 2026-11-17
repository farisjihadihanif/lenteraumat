const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");
const mail = require("../src/services/mail");
const config = require("../src/config");
const gemini = require("../src/services/gemini");

let app;
before(async () => (app = await h.start()));
after(h.stop);
beforeEach(h.reset);

test("lupa password: email berisi link, token sekali pakai, sesi lama keluar", async () => {
  const sent = [];
  mail.setSender(async (m) => sent.push(m));
  config.smtp.user = "tes@gmail.com";
  config.smtp.pass = "x";
  try {
    const old = await h.makeUser(app, "lupa");
    // email tidak terdaftar: jawaban sama, tidak ada email
    const r0 = await h.request(app).post("/api/auth/forgot").send({ email: "tidakada@lu.id" }).expect(200);
    assert.equal(sent.length, 0);
    const r1 = await h.request(app).post("/api/auth/forgot").send({ email: "lupa@lu.id" }).expect(200);
    assert.equal(r0.body.message, r1.body.message);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "lupa@lu.id");
    const token = /token=([a-f0-9]{64})/.exec(sent[0].text)[1];
    await h.request(app).post("/api/auth/reset").send({ token, password: "pendek" }).expect(400);
    const ok = await h.request(app).post("/api/auth/reset").send({ token, password: "passwordbaru1" }).expect(200);
    assert.equal(ok.body.user.username, "lupa");
    await h.request(app).post("/api/auth/reset").send({ token, password: "passwordbaru2" }).expect(400);
    assert.equal((await old.get("/api/auth/me")).body.user, null);
    await h.request(app).post("/api/auth/login").send({ identifier: "lupa", password: "passwordbaru1" }).expect(200);
  } finally {
    config.smtp.user = "";
    config.smtp.pass = "";
  }
});

test("laporan: user melapor, admin melihat & menghapus konten", async () => {
  const admin = await h.makeAdmin(app);
  const a = await h.makeUser(app, "pelapor");
  const b = await h.makeUser(app, "penulis");
  const d = (await b.post("/api/discussions").send({ judul: "Spam", isi: "Beli sekarang murah sekali di sini" }).expect(201)).body.discussion;
  await h.request(app).post("/api/reports").send({ targetType: "discussion", target: d._id, alasan: "spam" }).expect(401);
  await a.post("/api/reports").send({ targetType: "discussion", target: d._id, alasan: "apaaja" }).expect(400);
  await a.post("/api/reports").send({ targetType: "discussion", target: d._id, alasan: "lainnya" }).expect(400);
  await a.post("/api/reports").send({ targetType: "discussion", target: d._id, alasan: "spam" }).expect(201);
  await a.post("/api/reports").send({ targetType: "discussion", target: d._id, alasan: "spam" }).expect(200); // tidak dobel
  await a.get("/api/reports").expect(403);
  assert.equal((await admin.get("/api/admin/stats")).body.laporan, 1);
  const list = (await admin.get("/api/reports").expect(200)).body;
  assert.equal(list.total, 1);
  assert.equal(list.items[0].targetInfo.title, "Spam");
  assert.equal(list.items[0].reporter.username, "pelapor");
  await admin.post(`/api/reports/${list.items[0]._id}/remove-content`).expect(200);
  await h.request(app).get(`/api/discussions/${d._id}`).expect(404);
  assert.equal((await admin.get("/api/reports?status=selesai")).body.total, 1);
});

test("LUMA: batas harian per user, admin tanpa batas", async () => {
  gemini.setFetch(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Jawaban" }] } }] }), { status: 200, headers: { "content-type": "application/json" } }));
  const prevKey = config.geminiApiKey;
  const prevLimit = config.lumaDailyLimit;
  config.geminiApiKey = "tes";
  config.lumaDailyLimit = 2;
  try {
    const u = await h.makeUser(app, "rajin");
    assert.equal((await u.get("/api/ai/usage")).body.remaining, 2);
    await u.post("/api/ai/chat").send({ message: "satu" }).expect(200);
    await u.post("/api/ai/chat").send({ message: "dua" }).expect(200);
    const r = await u.post("/api/ai/chat").send({ message: "tiga" }).expect(429);
    assert.match(r.body.message, /Batas LUMA hari ini/);
    assert.equal((await u.get("/api/ai/usage")).body.remaining, 0);
    const admin = await h.makeAdmin(app);
    for (let i = 0; i < 3; i++) await admin.post("/api/ai/chat").send({ message: `x${i}` }).expect(200);
    assert.equal((await admin.get("/api/ai/usage")).body.remaining, null);
  } finally {
    config.geminiApiKey = prevKey;
    config.lumaDailyLimit = prevLimit;
    gemini.setFetch(null);
  }
});

test("diskusi: balas komentar orang lain (satu tingkat), hapus induk ikut hapus balasan", async () => {
  const a = await h.makeUser(app, "andi");
  const b = await h.makeUser(app, "bela");
  const c = await h.makeUser(app, "cici");
  const d = (await a.post("/api/discussions").send({ judul: "Topik", isi: "Isi diskusi yang cukup panjang" }).expect(201)).body.discussion;
  const k1 = (await b.post(`/api/discussions/${d._id}/comments`).send({ isi: "Komentar utama" }).expect(201)).body.comment;
  const r1 = (await c.post(`/api/discussions/${d._id}/comments`).send({ isi: "Balas bela", parent: k1._id }).expect(201)).body.comment;
  assert.equal(r1.parent, k1._id);
  assert.equal(r1.replyTo.username, "bela");
  // balas sebuah balasan: tetap menempel ke komentar utama, replyTo = cici
  const r2 = (await a.post(`/api/discussions/${d._id}/comments`).send({ isi: "Balas cici", parent: r1._id }).expect(201)).body.comment;
  assert.equal(r2.parent, k1._id);
  assert.equal(r2.replyTo.username, "cici");
  await a.post(`/api/discussions/${d._id}/comments`).send({ isi: "x", parent: "6afc77403550860bbeacd7e0" }).expect(404);
  let det = (await h.request(app).get(`/api/discussions/${d._id}`)).body;
  assert.equal(det.comments.length, 3);
  assert.equal(det.discussion.balasanCount, 3);
  await b.delete(`/api/discussions/${d._id}/comments/${k1._id}`).expect(200);
  det = (await h.request(app).get(`/api/discussions/${d._id}`)).body;
  assert.equal(det.comments.length, 0);
  assert.equal(det.discussion.balasanCount, 0);
});
