const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");
const script = require("../scripts/rapikan-kategori");
const Book = require("../src/models/Book");
const Category = require("../src/models/Category");
const User = require("../src/models/User");

let app;
before(async () => (app = await h.start()));
after(h.stop);

test("kemiripan nama kategori", () => {
  assert.equal(script.kemiripan("Fikih", "Fiqih"), "sama");
  assert.equal(script.kemiripan("Kesehatan", "Kesehatn"), "mirip");
  assert.equal(script.kemiripan("Pendidikan", "Pendidikan Islam"), "bagian");
  assert.equal(script.kemiripan("Hadis", "Fikih"), "");
});

test("rapikan kategori: uji coba tidak menulis, simpan memindah & menghapus, aman diulang", async () => {
  await h.makeAdmin(app);
  const admin = await User.findOne({ role: "admin" });
  await Category.insertMany(["Sains & Teknologi", "Teknologi", "Anak", "Umum"].map((nama) => ({ nama })));
  for (const kategori of ["Sains & Teknologi", "Sains & Teknologi", "Teknologi", "Anak"]) {
    await Book.create({ judul: "Buku", penulis: "X", kategori, file: { url: "https://x.id/a.pdf", storage: "external" }, uploadedBy: admin._id, status: "disetujui" });
  }
  const diam = () => {};

  await script.run({}, diam);
  assert.equal(await Book.countDocuments({ kategori: "Sains & Teknologi" }), 2);
  assert.ok(await Category.exists({ nama: "Sains & Teknologi" }));

  // Rencana yang salah ditolak sebelum ada yang ditulis.
  await assert.rejects(script.run({ ...script.args(["--gabung", "Anak=Tidak Ada"]), simpan: true }, diam), /tidak ada/);
  await assert.rejects(script.run({ gabung: [["Umum", "Teknologi"]], simpan: true }, diam), /tidak bisa dihapus/);
  assert.equal(await Book.countDocuments({ kategori: "Sains & Teknologi" }), 2);

  const r = await script.run({ ...script.args(["--gabung", "Anak=Umum"]), simpan: true }, diam);
  assert.deepEqual([r.dipindah, r.dihapus], [3, 2]);
  assert.equal(await Book.countDocuments({ kategori: "Teknologi" }), 3);
  const nama = (await h.request(app).get("/api/books/categories")).body.categories.map((c) => c.name).sort();
  assert.deepEqual(nama, ["Teknologi", "Umum"]);

  const lagi = await script.run({ simpan: true }, diam);
  assert.deepEqual([lagi.dipindah, lagi.dihapus], [0, 0]);
});

test("rapikan kategori: tujuan dibuat, buku tertentu dipindah, asal tetap ada, aman diulang", async () => {
  const admin = await User.findOne({ role: "admin" });
  await Category.insertMany(["Pendidikan Islam", "Pengembangan Diri"].map((nama) => ({ nama })));
  const buat = (judul, kategori) => Book.create({ judul, penulis: "X", kategori, file: { url: "https://x.id/a.pdf", storage: "external" }, uploadedBy: admin._id, status: "disetujui" });
  await buat("A", "Pendidikan Islam");
  await buat("B", "Pengembangan Diri");
  await buat("C", "Pengembangan Diri");
  const opsi = { pindah: [["Pengembangan Diri", "Pendidikan", "B"]] };
  const diam = () => {};

  const uji = await script.run(opsi, diam);
  assert.deepEqual([uji.akhir.Pendidikan, uji.akhir["Pengembangan Diri"], uji.akhir["Pendidikan Islam"]], [2, 1, undefined]);
  assert.equal(await Category.exists({ nama: "Pendidikan" }), null);
  assert.equal(await Book.countDocuments({ kategori: "Pendidikan" }), 0);

  await script.run({ ...opsi, simpan: true }, diam);
  assert.equal(await Category.exists({ nama: "Pendidikan Islam" }), null);
  assert.equal((await Category.findOne({ nama: "Pendidikan" })).urutan, 6);
  assert.deepEqual((await Book.find({ kategori: "Pendidikan" }).sort("judul")).map((b) => b.judul), ["A", "B"]);
  assert.equal((await Book.findOne({ judul: "C" })).kategori, "Pengembangan Diri");

  const lagi = await script.run({ ...opsi, simpan: true }, diam);
  assert.deepEqual([lagi.dipindah, lagi.dihapus], [0, 0]);
});
