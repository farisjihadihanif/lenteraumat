const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");
const gemini = require("../src/services/gemini");

let app;
before(async () => (app = await h.start()));
after(h.stop);
beforeEach(h.reset);

test("berkas buku tidak disajikan sebagai application/pdf (anti download manager)", async () => {
  const admin = await h.makeAdmin(app);
  const id = (await h.uploadBook(admin)).body.book._id;
  const r = await h.request(app).get(`/api/books/${id}/file`).expect(200);
  assert.notEqual(r.headers["content-type"], "application/pdf");
  assert.equal(r.headers["content-disposition"], undefined);
});

test("diskusi: suka, repost, hot topic, flag milik saya", async () => {
  const a = await h.makeUser(app, "aisyah");
  const b = await h.makeUser(app, "budi");
  const d1 = (await a.post("/api/discussions").send({ judul: "Satu", isi: "Isi diskusi pertama yang cukup panjang" }).expect(201)).body.discussion;
  const d2 = (await a.post("/api/discussions").send({ judul: "Dua", isi: "Isi diskusi kedua yang cukup panjang" }).expect(201)).body.discussion;
  await h.request(app).post(`/api/discussions/${d1._id}/like`).expect(401);
  assert.deepEqual((await b.post(`/api/discussions/${d1._id}/like`).expect(200)).body, { active: true, count: 1 });
  assert.deepEqual((await b.post(`/api/discussions/${d1._id}/like`).expect(200)).body, { active: false, count: 0 });
  await b.post(`/api/discussions/${d1._id}/like`).expect(200);
  await b.post(`/api/discussions/${d2._id}/repost`).expect(200);
  await b.post(`/api/discussions/${d2._id}/comments`).send({ isi: "balas" }).expect(201);

  const hot = (await b.get("/api/discussions?sort=hot").expect(200)).body.items;
  assert.equal(hot[0].judul, "Dua"); // repost (4) + balasan (3) > suka (2)
  assert.equal(hot[0].repostedByMe, true);
  assert.equal(hot[0].lastRepostBy.username, "budi");
  assert.equal(hot[1].likedByMe, true);
  assert.equal(hot[1].likes, undefined); // daftar user tidak dibocorkan
  const asA = (await a.get(`/api/discussions/${d1._id}`)).body.discussion;
  assert.equal(asA.likedByMe, false);
  assert.equal(asA.likeCount, 1);
  const prof = (await h.request(app).get("/api/users/budi")).body;
  assert.equal(prof.reposts[0].judul, "Dua");
});

test("ganti akun: akun tersimpan di perangkat, pindah tanpa password", async () => {
  const agent = h.request.agent(app);
  await agent.post("/api/auth/register").send({ username: "satu", email: "satu@lu.id", password: "rahasia123", namaLengkap: "Satu" }).expect(201);
  await h.request(app).post("/api/auth/register").send({ username: "dua", email: "dua@lu.id", password: "rahasia123", namaLengkap: "Dua" }).expect(201);
  // tambah akun kedua di perangkat yang sama
  await agent.post("/api/auth/login").send({ identifier: "dua", password: "rahasia123" }).expect(200);
  assert.equal((await agent.get("/api/auth/me")).body.user.username, "dua");
  const acc = (await agent.get("/api/auth/accounts").expect(200)).body.accounts;
  assert.deepEqual(acc.map((x) => [x.username, x.current]).sort(), [["dua", true], ["satu", false]]);
  assert.equal(acc[0].email, undefined);
  const satuId = acc.find((x) => x.username === "satu")._id;
  await agent.post("/api/auth/switch").send({ userId: satuId }).expect(200);
  assert.equal((await agent.get("/api/auth/me")).body.user.username, "satu");
  // perangkat lain tidak bisa pindah ke akun yang tidak tersimpan di perangkatnya
  await h.request(app).post("/api/auth/switch").send({ userId: satuId }).expect(401);
  // keluar dari "satu": hanya akun itu yang dilupakan
  await agent.post("/api/auth/logout").expect(200);
  const left = (await agent.get("/api/auth/accounts")).body.accounts;
  assert.deepEqual(left.map((x) => x.username), ["dua"]);
  await agent.post("/api/auth/switch").send({ userId: left[0]._id }).expect(200);
  // password "dua" diganti di perangkat lain -> token tersimpan tidak berlaku lagi
  const other = h.request.agent(app);
  await other.post("/api/auth/login").send({ identifier: "dua", password: "rahasia123" }).expect(200);
  await other.put("/api/users/me/password").send({ passwordLama: "rahasia123", passwordBaru: "barubaru123" }).expect(200);
  assert.equal((await agent.get("/api/auth/accounts")).body.accounts.length, 0);
  await agent.post("/api/auth/logout-all").expect(200);
});

test("LUMA: lampiran dikirim lewat Files API, nama pengguna di system prompt", async () => {
  const user = await h.makeUser(app, "faris");
  const calls = [];
  gemini.setFetch(async (url, opts) => {
    calls.push({ url, opts });
    if (url.includes("/upload/v1beta/files") && opts.headers["X-Goog-Upload-Command"] === "start") {
      return new Response("{}", { status: 200, headers: { "x-goog-upload-url": "https://upload.example/123" } });
    }
    if (url === "https://upload.example/123") {
      return new Response(JSON.stringify({ file: { name: "files/abc", uri: "https://generativelanguage.googleapis.com/v1beta/files/abc", mimeType: "image/png", state: "ACTIVE", expirationTime: new Date(Date.now() + 864e5).toISOString() } }));
    }
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Itu gambar satu piksel." }] } }] }));
  });
  const r = await user.post("/api/ai/chat").field("message", "Ini gambar apa?").attach("lampiran", h.PNG, { filename: "x.png", contentType: "image/png" }).expect(200);
  assert.equal(r.body.reply, "Itu gambar satu piksel.");
  assert.equal(r.body.lampiran[0].name, "x.png");
  const gen = JSON.parse(calls.at(-1).opts.body);
  assert.match(gen.systemInstruction.parts[0].text, /Nama pengguna: FARIS/);
  assert.deepEqual(gen.contents.at(-1).parts[0], { fileData: { mimeType: "image/png", fileUri: "https://generativelanguage.googleapis.com/v1beta/files/abc" } });
  // pesan berikutnya: lampiran lama ikut dikirim ulang (masih berlaku)
  await user.post("/api/ai/chat").send({ message: "Warnanya apa?", sessionId: r.body.sessionId }).expect(200);
  const gen2 = JSON.parse(calls.at(-1).opts.body);
  assert.ok(gen2.contents.some((c) => c.parts.some((p) => p.fileData)));
  // jenis file yang tidak didukung
  const bad = await user.post("/api/ai/chat").field("message", "x").attach("lampiran", Buffer.from("PK"), { filename: "a.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }).expect(400);
  assert.match(bad.body.message, /PDF/);
});

test("Kuis mode guru dari topik: campuran + kunci jawaban", async () => {
  const user = await h.makeUser(app, "guru");
  let prompt = "";
  gemini.setFetch(async (url, opts) => {
    prompt = JSON.parse(opts.body).contents[0].parts[0].text;
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ questions: [
          { type: "pilihan", question: "Rukun Islam ada?", options: ["A. 3", "B. 4", "C. 5", "D. 6"], answer: "C. 5", explanation: "Hadis Jibril." },
          { type: "esai", question: "Jelaskan makna syahadat.", answer: "Persaksian tauhid dan kerasulan.", explanation: "-" },
        ] }) }] } }],
      }),
    );
  });
  await user.post("/api/ai/quiz").send({ untuk: "guru", type: "campuran" }).expect(400);
  const r = await user.post("/api/ai/quiz").send({ untuk: "guru", type: "campuran", topik: "Rukun Islam", jenjang: "SD kelas 4", count: 2 }).expect(200);
  assert.equal(r.body.quiz.untuk, "guru");
  assert.match(prompt, /SD kelas 4/);
  assert.deepEqual(r.body.quiz.questions[0].options, ["3", "4", "5", "6"]);
  assert.equal(r.body.quiz.questions[0].answer, "5");
  assert.equal(r.body.quiz.questions[1].type, "esai");
});
