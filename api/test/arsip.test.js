const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const h = require("./helpers");
const A = require("../src/services/arsip");
const audit = require("../scripts/audit-arsip");
const impor = require("../scripts/impor-arsip");
const Book = require("../src/models/Book");
const Category = require("../src/models/Category");
const User = require("../src/models/User");

let app;
before(async () => (app = await h.start()));
after(h.stop);

test("tahun: jilid itu sendiri, bukan awal seri", () => {
  assert.equal(A.tahunAsli({ title: "Buku", date: "1902" }).tahun, 1902);
  assert.equal(A.tahunAsli({ title: "Buku", date: "1925-03-01" }).tahun, 1925);
  assert.equal(A.tahunAsli({ title: "Kamus", date: "1886-8" }).tahun, 1888);
  assert.equal(A.tahunAsli({ title: "Transaksi", date: "1779", volume: "v.60 (1913)" }).tahun, 1913);
  assert.equal(A.tahunAsli({ title: "1900; or, The last President", date: "1896" }).tahun, 1896);
  for (const m of [
    { title: "Revue suisse de zoologie", date: "1893", volume: "t. 82 1975" },
    { title: "Smithsonian miscellaneous collections", date: "1862", volume: "v.118 (1952)" },
    { title: "The Victorian naturalist", date: "1884", year: "1996", volume: "113" },
    { title: "Katalog", date: "1903-1940", volume: "7" },
    { title: "Enzyklopaedie des Islam", date: "1913", volume: "04" },
    { title: "Victoria history of Essex", date: "1903-", volume: "4" },
    { title: "Kamus", date: "[19--]" },
    { title: "Menggambar", date: "[192-?]" },
    { title: "The Muslim world", date: "1911", volume: "12", subject: ["Islam -- Periodicals"] },
    { title: "Tanpa tahun" },
  ])
    assert.ok(A.tahunAsli(m).alasan, JSON.stringify(m));
});

test("topik terlarang & hak cipta", () => {
  for (const title of ["The lesser key of Solomon, Goetia", "The Kybalion", "The sixth and seventh books of Moses, or, Moses' magical spirit-art", "Bible defence of slavery", "Forty-five years of registration statistics, proving vaccination to be both useless and dangerous"])
    assert.ok(A.topikTerlarang({ title }), title);
  for (const title of ["The spirit of Islam", "A history of slavery and its abolition", "Vaccination: its natural history", "The magic flute", "The song of Solomon"]) assert.equal(A.topikTerlarang({ title }), "", title);
  assert.equal(A.masalahHak({ "possible-copyright-status": "NOT_IN_COPYRIGHT" }), "");
  assert.equal(A.masalahHak({ rights: "The Library of Congress is unaware of any copyright restrictions" }), "");
  assert.equal(A.masalahHak({}), "");
  assert.ok(A.masalahHak({ rights: "In Copyright. Digitized with the permission of the rights holder." }));
  assert.ok(A.masalahHak({ licenseurl: "http://creativecommons.org/licenses/by-nc-nd/3.0/" }));
});

test("kategori", () => {
  const k = (judul, ...subjek) => A.pilihKategori(subjek, judul);
  assert.equal(k("The Koran"), "Al-Qur'an & Tafsir");
  assert.equal(k("A dictionary of Islam", "Islam -- Dictionaries"), "Sejarah Islam");
  assert.equal(k("The Muslim world", "Islam -- Periodicals"), "Sejarah Islam");
  assert.equal(k("The faith of Islam", "Islam"), "Akidah & Akhlak");
  assert.equal(k("The natural history of Pliny", "Natural history"), "Sains");
  assert.equal(k("Khasi-English dictionary"), "Bahasa");
  assert.equal(k("Fiqh al-lughah"), "Bahasa");
  assert.equal(k("Frank Amor: A Novel"), "Sastra");
  assert.equal(k("The Victoria history of the county of Kent", "Natural history"), "Sejarah");
  assert.equal(k("Plane trigonometry"), "Sains");
});

test("duplikat: edisi & ejaan lain dikenali, jilid dibatasi, karya berbeda lolos", () => {
  const p = A.buatPencatat();
  const b = (judul, penulis, tahun) => ({ judul, penulis, tahun });
  p.tambah(b("Dictionary of Islam; being a cyclopaedia", "Hughes, Thomas Patrick", 1895));
  assert.ok(p.tolak(b("A dictionary of Islam : being a cyclopaedia", "Hughes, Thomas Patrick, 1838-1911", 1885)));
  p.tambah(b("The Preaching of Islam: A History", "Thomas Walker Arnold", 1896));
  assert.ok(p.tolak(b("The preaching of Islam; a history", "Arnold, Thomas Walker, Sir", 1913)));
  p.tambah(b("Haydn's universal index of biography from", "Haydn, Joseph", 1870));
  assert.ok(p.tolak(b("Haydn's univeral index of biography from", "Haydn, Joseph", 1870)));
  p.tambah(b("Plane geometry", "Loney, S. L.", 1893));
  assert.equal(p.tolak(b("Plane geometry", "Hall, H. S.", 1901)), "");
  p.tambah(b("The Muslim world (Jilid 1)", "Hartford", 1911));
  assert.equal(p.tolak(b("The Moslem world (Jilid 2)", "Hartford", 1912)), "");
  p.tambah(b("The Muslim world (Jilid 2)", "Hartford", 1912));
  assert.match(p.tolak(b("The Muslim world (Jilid 3)", "Hartford", 1913)), /2 jilid/);
});

test("impor: --kering selalu menang, bawaan tidak menyimpan", () => {
  assert.equal(impor.args([]).simpan, false);
  assert.equal(impor.args(["--simpan"]).simpan, true);
  assert.equal(impor.args(["--simpan", "--kering"]).simpan, false);
});

test("audit arsip: uji coba tidak menulis; simpan mencadangkan, menghapus, memindah; buku lain aman", async () => {
  await h.makeAdmin(app);
  const admin = await User.findOne({ role: "admin" });
  await Category.deleteMany({});
  await Category.insertMany([{ nama: "Umum" }, { nama: "Sains" }]);
  const buat = (id, createdAt) =>
    Book.create({ judul: id, penulis: "X", kategori: "Umum", sumber: "Internet Archive", sumberUrl: `https://archive.org/details/${id}`, file: { url: "https://x.id/a.pdf", storage: "external" }, uploadedBy: admin._id, status: "disetujui", createdAt });
  const hariIni = new Date("2026-11-24T12:00:00+07:00");
  await buat("a", hariIni);
  await buat("b", hariIni);
  await buat("c", hariIni);
  await buat("lama", new Date("2026-11-18T00:30:00+07:00"));
  const dasar = { no: 1, judul: "x", tahun: 1900, kategori: "Umum" };
  const daftar = [
    { ...dasar, arsip: "a", aksi: "hapus", alasan: "uji" },
    { ...dasar, arsip: "b", aksi: "pindah", ke: "Sains" },
    { ...dasar, arsip: "c", aksi: "tetap", tinjau: "uji" },
    { ...dasar, arsip: "lama", aksi: "hapus", alasan: "uji" },
  ];
  const diam = () => {};
  const cadangan = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "audit-")), "c.json");

  const uji = await audit.run({ daftar }, diam);
  assert.deepEqual([uji.hapus, uji.pindah, uji.tinjau, uji.jumlah.Umum], [1, 1, 1, 2]);
  assert.equal(await Book.countDocuments(), 4);
  await assert.rejects(audit.run({ daftar, simpan: true }, diam), /cadangan/);

  await audit.run({ daftar, simpan: true, cadangan }, diam);
  assert.deepEqual((await Book.find().sort("judul")).map((x) => [x.judul, x.kategori]), [["b", "Sains"], ["c", "Umum"], ["lama", "Umum"]]);
  assert.deepEqual(JSON.parse(fs.readFileSync(cadangan, "utf8")).map((x) => x.judul), ["a"]);
  const lagi = await audit.run({ daftar }, diam);
  assert.deepEqual([lagi.hapus, lagi.pindah], [0, 0]);
});
