// Jawaban LUMA dialirkan (SSE), dengan cadangan tanpa streaming.
const h = require("./helpers");
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const gemini = require("../src/services/gemini");
const ChatSession = require("../src/models/ChatSession");

let app, user, calls, stream;
const sse = (...events) => new Response(events.map((e) => `data: ${JSON.stringify(e)}\r\n\r\n`).join(""), { status: 200 });
const bagian = (text, finishReason) => ({ candidates: [{ content: { parts: [{ text }] }, ...(finishReason ? { finishReason } : {}) }] });
before(async () => {
  app = await h.start();
  gemini.setFetch(async (url, opts) => {
    calls.push(/streamGenerateContent\?alt=sse/.test(url) ? "stream" : "biasa");
    return calls.at(-1) === "stream" ? stream(opts) : new Response(JSON.stringify(bagian("Jawaban utuh")), { status: 200 });
  });
});
after(h.stop);
beforeEach(async () => {
  await h.reset();
  calls = [];
  user = await h.makeUser(app, "faris");
});
const tanya = () => user.post("/api/ai/chat").set("Accept", "text/event-stream").send({ message: "halo" });
const isi = (r) => r.text.trim().split("\n\n").map((x) => JSON.parse(x.slice(5)));

test("teks dialirkan lalu disimpan dan dihitung sekali", async () => {
  stream = () => sse({ candidates: [{ content: { parts: [{ text: "pikiran", thought: true }] } }] }, bagian("Sabar "), bagian("itu indah.", "STOP"));
  const e = isi(await tanya().expect(200).expect("Content-Type", /event-stream/));
  assert.deepEqual(e.slice(0, 2), [{ text: "Sabar " }, { text: "itu indah." }]);
  assert.equal(e[2].done.reply, "Sabar itu indah.");
  const s = await ChatSession.findById(e[2].done.sessionId);
  assert.deepEqual(s.messages.map((m) => m.content), ["halo", "Sabar itu indah."]);
  assert.equal((await user.get("/api/ai/usage")).body.used, 1);
});

test("aliran putus di tengah: dibuang lalu dijawab tanpa streaming", async (t) => {
  t.mock.method(console, "error", () => {});
  stream = () => sse(bagian("Setengah"), { error: { message: "putus" } });
  const e = isi(await tanya().expect(200));
  assert.deepEqual(e.map((x) => Object.keys(x)[0]), ["text", "reset", "done"]);
  assert.equal(e[2].done.reply, "Jawaban utuh");
  assert.deepEqual(calls, ["stream", "biasa"]);
});

test("streaming ditolak Gemini: tetap dijawab", async (t) => {
  t.mock.method(console, "error", () => {});
  stream = () => new Response("{}", { status: 503 });
  assert.equal(isi(await tanya().expect(200))[0].done.reply, "Jawaban utuh");
  assert.deepEqual(calls, ["stream", "stream", "stream", "biasa"]);
});

test("model sibuk sesaat: percobaan berikutnya tetap dialirkan", async (t) => {
  t.mock.method(console, "error", () => {});
  stream = () => (calls.length < 3 ? new Response("{}", { status: 503 }) : sse(bagian("Akhirnya", "STOP")));
  const e = isi(await tanya().expect(200));
  assert.deepEqual(e[0], { text: "Akhirnya" });
  assert.equal(e[1].done.reply, "Akhirnya");
});

test("galat sebelum teks pertama berupa JSON biasa dan tidak menghabiskan jatah", async () => {
  stream = () => sse({ promptFeedback: { blockReason: "SAFETY" } });
  const r = await tanya().expect(422);
  assert.match(r.body.message, /tidak bisa menjawab/);
  assert.equal((await user.get("/api/ai/usage")).body.used, 0);
});

test("browser memutus di tengah: Gemini dihentikan, tidak disimpan atau dihitung", async (t) => {
  t.mock.method(console, "error", () => {});
  let dihentikan = false;
  stream = (opts) =>
    new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(bagian("Awal"))}\n\n`));
          opts.signal.addEventListener("abort", () => {
            dihentikan = true;
            c.error(new Error("abort"));
          });
        },
      }),
      { status: 200 },
    );
  const login = await h.request(app).post("/api/auth/login").send({ identifier: "faris@lu.id", password: "rahasia123" });
  const cookie = login.headers["set-cookie"].map((c) => c.split(";")[0]).join("; ");
  const server = app.listen(0);
  await new Promise((resolve) => {
    const req = http.request({ port: server.address().port, path: "/api/ai/chat", method: "POST", headers: { Accept: "text/event-stream", "Content-Type": "application/json", Cookie: cookie } }, (res) => {
      res.once("data", () => {
        req.destroy();
        resolve();
      });
      res.on("error", () => {});
    });
    req.on("error", () => {});
    req.end(JSON.stringify({ message: "halo" }));
  });
  await h.wait(300);
  server.close();
  assert.ok(dihentikan);
  assert.deepEqual(calls, ["stream"]);
  assert.equal(await ChatSession.countDocuments(), 0);
  assert.equal((await user.get("/api/ai/usage")).body.used, 0);
});

test("tanpa Accept event-stream: JSON seperti biasa", async () => {
  const r = await user.post("/api/ai/chat").send({ message: "halo" }).expect(200);
  assert.equal(r.body.reply, "Jawaban utuh");
  assert.deepEqual(calls, ["biasa"]);
});
