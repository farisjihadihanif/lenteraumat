const h = require("./helpers");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const script = require("../scripts/indeks-teks");
const Book = require("../src/models/Book");
const BookText = require("../src/models/BookText");
const User = require("../src/models/User");

let server;
let base;
let hits = [];
before(async () => {
  await h.makeAdmin(await h.start());
  server = http.createServer((req, res) => {
    hits.push(req.url);
    if (req.url === "/ok") return res.end(h.makePdf(["Sabar adalah menahan diri dari keluh kesah ketika menghadapi ujian hidup."]));
    if (req.url === "/scan") return res.end(h.makePdf([""]));
    res.writeHead(500).end();
  });
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.close();
  server.closeAllConnections();
  await h.stop();
});

test("argumen", () => {
  assert.deepEqual(script.args(["--simpan", "--jumlah", "3"]), { simpan: true, cepat: false, jumlah: 3 });
  assert.throws(() => script.args(["--jumlah", "x"]));
});

test("uji coba tidak menulis; simpan mengisi yang belum ada; aman diulang", async () => {
  const admin = await User.findOne({ role: "admin" });
  const buat = (jalur, status = "disetujui") => Book.create({ judul: jalur, penulis: "X", file: { url: base + jalur, storage: "external" }, uploadedBy: admin._id, status });
  const ok = await buat("/ok");
  const scan = await buat("/scan");
  const rusak = await buat("/rusak");
  const ada = await buat("/ada");
  await buat("/tunggu", "menunggu");
  await BookText.create({ book: ada._id, text: "sudah ada" });
  const diam = () => {};

  await script.run({}, diam);
  assert.equal(hits.length, 0);
  assert.equal(await BookText.countDocuments(), 1);

  assert.deepEqual(await script.run({ simpan: true, jeda: 1 }, diam), { selesai: 1, gagal: 2, dilewati: 1 });
  assert.match((await BookText.findOne({ book: ok._id })).text, /menahan diri/);
  assert.ok((await BookText.findOne({ book: scan._id })).error);
  // gangguan sumber tidak dicatat, supaya dicoba lagi
  assert.equal(await BookText.exists({ book: rusak._id }), null);
  assert.ok(!hits.includes("/tunggu") && !hits.includes("/ada"));

  hits = [];
  assert.deepEqual(await script.run({ simpan: true, jeda: 1 }, diam), { selesai: 0, gagal: 1, dilewati: 3 });
  assert.ok(hits.every((u) => u === "/rusak"));
});
