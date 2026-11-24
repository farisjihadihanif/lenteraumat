const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const h = require("./helpers");
const importer = require("../src/services/importer");
const gemini = require("../src/services/gemini");
const script = require("../scripts/impor-katalog");
const Book = require("../src/models/Book");
const BookText = require("../src/models/BookText");
const Category = require("../src/models/Category");

let app;
before(async () => (app = await h.start()));
after(h.stop);

const item = (x = {}) => ({
  judul: "Belajar Sains",
  penulis: "A. Penulis dkk.",
  tahunTerbit: 2020,
  penerbit: "Jurnal Contoh (Universitas Contoh)",
  kategori: "Sains",
  deskripsi: "Ringkasan.",
  sumber: "Jurnal Contoh",
  sumberUrl: "https://jurnal.contoh.id/a/1",
  pdfUrl: "https://jurnal.contoh.id/a/1.pdf",
  lisensi: "CC BY-SA 4.0",
  lisensiUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  sitasi: "A. Penulis (2020). Belajar Sains.",
  ...x,
});

test("impor katalog: lisensi ketat, uji coba tidak menulis, tautan luar, LUMA membaca", async () => {
  const bad = (x) => script.periksa(item(x)).length > 0;
  assert.deepEqual(script.periksa(item()), []);
  for (const l of ["by-nc-nd", "by-nd", "by-nc-sa"]) {
    assert.ok(bad({ lisensi: `CC ${l.toUpperCase()} 4.0`, lisensiUrl: `https://creativecommons.org/licenses/${l}/4.0/` }));
  }
  assert.ok(bad({ lisensi: "" }));
  assert.ok(bad({ lisensi: "CC BY 4.0" }));
  assert.ok(bad({ sumberUrl: "javascript:alert(1)" }));
  assert.ok(bad({ jenis: "pemerintah", lisensiUrl: "https://contoh.go.id/x" }));

  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kat-")), "katalog.json");
  fs.writeFileSync(
    file,
    JSON.stringify([
      item(),
      item({ judul: "Buku Kedua", sumberUrl: "https://jurnal.contoh.id/a/2", pdfUrl: "https://jurnal.contoh.id/a/2.pdf", sampul: "halaman-pertama" }),
      item({ judul: "Lisensi buruk", sumberUrl: "https://x.id/3", pdfUrl: "https://x.id/3.pdf", lisensi: "?", lisensiUrl: "https://x.id/hak" }),
    ]),
  );
  await h.makeAdmin(app);
  const pdf = h.makePdf(["Fotosintesis mengubah cahaya matahari menjadi energi kimia di dalam kloroplas tumbuhan hijau."]);
  let unduh = 0;
  importer.setLookup(async () => [{ address: "93.184.216.34" }]);
  importer.setFetch(async () => {
    unduh++;
    return new Response(pdf);
  });

  assert.deepEqual(await script.run({ file }, () => {}), { siap: 2, ditambahkan: 0, dilewati: 0, gagal: 1 });
  assert.equal(await Book.countDocuments(), 0);
  assert.equal(unduh, 0);

  const r = await script.run({ file, simpan: true, jeda: 0 }, () => {});
  assert.deepEqual([r.ditambahkan, r.gagal], [2, 1]);
  const book = await Book.findOne({ judul: "Belajar Sains" });
  assert.equal(book.file.storage, "external");
  assert.equal(book.file.url, "https://jurnal.contoh.id/a/1.pdf");
  assert.equal(book.halaman, 1);
  assert.match(book.cover, /sampul/);
  assert.ok(await Category.exists({ nama: "Sains" }));
  const detail = (await h.request(app).get(`/api/books/${book._id}`)).body.book;
  assert.equal(detail.lisensiUrl, "https://creativecommons.org/licenses/by-sa/4.0/");
  assert.match(detail.sitasi, /2020/);
  assert.match((await BookText.findOne({ book: book._id })).text, /Fotosintesis/);

  assert.deepEqual(await script.run({ file, simpan: true, jeda: 0 }, () => {}), { siap: 0, ditambahkan: 0, dilewati: 2, gagal: 1 });

  // LUMA mengambil PDF luar dari server bila teks belum ada; balasan HTML tidak disimpan sebagai galat tetap.
  await BookText.deleteMany({});
  const agent = await h.makeUser(app, "pembaca");
  const asli = globalThis.fetch;
  let prompt = "";
  gemini.setFetch(async (url, o) => {
    prompt = o.body;
    return Response.json({ candidates: [{ content: { parts: [{ text: "Ringkasan buku." }] }, finishReason: "STOP" }] });
  });
  try {
    globalThis.fetch = async () => new Response("<html>pemeliharaan</html>");
    await agent.post("/api/ai/summary").send({ bookId: String(book._id) }).expect(502);
    assert.equal(await BookText.countDocuments(), 0);
    globalThis.fetch = async () => new Response(pdf);
    const s = await agent.post("/api/ai/summary").send({ bookId: String(book._id) }).expect(200);
    assert.match(s.text, /Ringkasan buku/);
    assert.match(prompt, /Fotosintesis/);
  } finally {
    globalThis.fetch = asli;
  }
});

test("impor katalog: entri gagal dibatalkan bersih dan dicoba lagi", async (t) => {
  const storage = require("../src/services/storage");
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kat-")), "katalog.json");
  fs.writeFileSync(file, JSON.stringify([item({ judul: "Gagal dulu", kategori: "Kategori Baru", sumberUrl: "https://y.id/1", pdfUrl: "https://y.id/1.pdf" })]));
  const pdf = h.makePdf(["Teks yang cukup panjang untuk dibaca."]);
  importer.setFetch(async () => new Response(pdf));
  const hapus = t.mock.method(storage, "remove");
  const bersih = async () => {
    assert.equal(await Book.countDocuments({ judul: "Gagal dulu" }), 0);
    assert.equal(await Category.countDocuments({ nama: "Kategori Baru" }), 0);
  };
  const impor = () => script.run({ file, simpan: true, jeda: 0 }, () => {});

  // Gagal sebelum sampul terunggah: tidak ada file yang dihapus.
  const simpan = t.mock.method(storage, "save", async () => {
    throw new Error("unggah gagal");
  });
  assert.equal((await impor()).gagal, 1);
  assert.equal(hapus.mock.callCount(), 0);
  await bersih();
  simpan.mock.restore();

  // Buku sudah tertulis tetapi balasannya gagal: buku & sampul ikut dibatalkan.
  const asli = Book.create;
  const buat = t.mock.method(Book, "create", async (...a) => {
    await asli.apply(Book, a);
    throw new Error("koneksi putus");
  });
  assert.equal((await impor()).gagal, 1);
  assert.equal(hapus.mock.callCount(), 1);
  await bersih();
  buat.mock.restore();

  assert.equal((await impor()).ditambahkan, 1);
});

test("katalog.json: semua entri lolos pemeriksaan", () => {
  for (const { item: i, salah } of script.muat()) assert.deepEqual(salah, [], i.judul);
});
