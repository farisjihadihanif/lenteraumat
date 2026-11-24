// Menjalankan hasil audit impor Internet Archive (data/audit-arsip-<tanggal>.json).
//
//   npm run audit:arsip                                    -> uji coba: daftar lengkap, TIDAK menulis apa pun
//   npm run audit:arsip -- --audit 2026-11-17              -> pilih audit (bawaan 2026-11-24)
//   npm run audit:arsip -- --simpan --cadangan <file.json> -> tulis; buku yang dihapus dicadangkan dulu
//
// Buku dicocokkan lewat tautan arsip DAN tanggal impor, jadi buku lain tidak tersentuh. Aman diulang.
const fs = require("fs");
const path = require("path");
const config = require("../src/config");
const { connect, mongoose } = require("../src/db");
const Book = require("../src/models/Book");
const Review = require("../src/models/Review");
const ReadingProgress = require("../src/models/ReadingProgress");
const Discussion = require("../src/models/Discussion");
const Category = require("../src/models/Category");
const { deleteBook } = require("../src/routes/cleanup");

// Rentang tanggal impor tiap audit (WIB, batas akhir tidak termasuk).
const AUDIT = {
  "2026-11-17": ["2026-11-17", "2026-11-19"],
  "2026-11-24": ["2026-11-24", "2026-11-25"],
};
const BAWAAN = "2026-11-24";
const berkas = (audit) => path.join(__dirname, "..", "data", `audit-arsip-${audit}.json`);
const rentang = (audit) => ({ $gte: new Date(`${AUDIT[audit][0]}T00:00:00+07:00`), $lt: new Date(`${AUDIT[audit][1]}T00:00:00+07:00`) });
const AKSI = ["hapus", "pindah", "tetap"];
const CATATAN = "Ditulis dari sudut pandang non-Muslim/misionaris; dibaca sebagai sumber sejarah.";
const tautan = (d) => `https://archive.org/details/${d.arsip}`;

function args(argv) {
  const nilai = (nama) => (argv.includes(nama) ? argv[argv.indexOf(nama) + 1] || "" : "");
  const audit = nilai("--audit") || BAWAAN;
  if (!AUDIT[audit]) throw new Error(`Audit tidak dikenal: ${audit}. Pilihan: ${Object.keys(AUDIT).join(", ")}`);
  return { simpan: argv.includes("--simpan"), cadangan: nilai("--cadangan"), audit };
}

const potong = (s, n = 90) => (s.length > n ? `${s.slice(0, n)}...` : s);
const perKategori = async () => Object.fromEntries((await Book.aggregate([{ $group: { _id: "$kategori", n: { $sum: 1 } } }])).map((r) => [r._id, r.n]));

async function run({ simpan = false, cadangan = "", audit = BAWAAN, daftar = JSON.parse(fs.readFileSync(berkas(audit), "utf8")), hari = rentang(audit) } = {}, log = console.log) {
  if (simpan && !cadangan) throw new Error("Tulis --cadangan <file.json> untuk menyimpan salinan buku yang dihapus.");
  if (simpan && fs.existsSync(cadangan)) throw new Error(`File cadangan sudah ada: ${cadangan}`);
  const salah = daftar.find((d) => !AKSI.includes(d.aksi) || (d.aksi === "hapus" && !d.alasan) || (d.aksi === "pindah" && !d.ke));
  if (salah) throw new Error(`Entri audit salah: ${salah.arsip}`);
  const nama = new Set(await Category.distinct("nama"));
  const asing = daftar.find((d) => d.aksi === "pindah" && !nama.has(d.ke));
  if (asing) throw new Error(`Kategori "${asing.ke}" tidak ada.`);

  const cari = new Map((await Book.find({ sumber: "Internet Archive", createdAt: hari })).map((b) => [b.sumberUrl, b]));
  const kena = daftar.map((d) => ({ ...d, buku: cari.get(tautan(d)) })).filter((d) => d.buku);
  const dikenal = new Set(daftar.map(tautan));
  const belum = [...cari.keys()].filter((u) => !dikenal.has(u));
  const hapus = kena.filter((d) => d.aksi === "hapus");
  const pindah = kena.filter((d) => d.aksi === "pindah" && d.buku.kategori === d.kategori);
  const bahasa = kena.filter((d) => d.aksi !== "hapus" && d.bahasa && d.buku.bahasa !== d.bahasa);
  const catatan = kena.filter((d) => d.aksi !== "hapus" && d.catatan && !(d.buku.deskripsi || "").includes(CATATAN));
  log(`Buku Internet Archive pada tanggal audit: ${cari.size}${belum.length ? `; di luar daftar audit (tidak disentuh): ${belum.join(", ")}` : ""}`);

  const akhir = await perKategori();
  log(`\nHAPUS (${hapus.length}):`);
  for (const d of hapus) {
    const q = { book: d.buku._id };
    const [ulasan, baca, diskusi] = await Promise.all([Review.countDocuments(q), ReadingProgress.countDocuments(q), Discussion.countDocuments(q)]);
    const pakai = [ulasan && `${ulasan} ulasan`, baca && `${baca} pembaca`, diskusi && `${diskusi} diskusi`, d.buku.disimpan.length && `disimpan ${d.buku.disimpan.length} orang`, d.buku.coverStored?.key && "sampul Cloudinary"].filter(Boolean);
    log(`  ${d.no}. ${potong(d.judul)} (${d.tahun}) | ${d.alasan}${pakai.length ? ` | ${pakai.join(", ")}` : ""}`);
    akhir[d.buku.kategori]--;
  }
  log(`\nPINDAH KATEGORI (${pindah.length}):`);
  for (const d of [...pindah].sort((a, b) => a.ke.localeCompare(b.ke) || a.no - b.no)) {
    log(`  ${d.no}. ${d.kategori} -> ${d.ke} | ${potong(d.judul)}`);
    akhir[d.kategori]--;
    akhir[d.ke] = (akhir[d.ke] || 0) + 1;
  }
  const tinjau = kena.filter((d) => d.tinjau);
  log(`\nTINJAU SENDIRI, tidak dihapus (${tinjau.length}):`);
  for (const d of tinjau) log(`  ${d.no}. [${d.tinjau}] ${potong(d.judul)} (${d.tahun})`);
  log(`\nCATATAN DI DESKRIPSI (${catatan.length}):`);
  for (const d of catatan) log(`  ${d.no}. ${potong(d.judul)}`);
  log(`\nPERBAIKI BAHASA (${bahasa.length}):`);
  for (const d of bahasa) log(`  ${d.no}. ${d.buku.bahasa} -> ${d.bahasa} | ${potong(d.judul, 70)}`);
  log(`\nTIDAK DIUBAH: ${kena.filter((d) => ![hapus, pindah, catatan, bahasa].some((x) => x.includes(d))).length} buku.`);

  if (simpan) {
    fs.writeFileSync(cadangan, JSON.stringify(hapus.map((d) => d.buku.toObject()), null, 1), { flag: "wx" });
    for (const d of hapus) await deleteBook(d.buku); // termasuk sampul di Cloudinary, kalau ada
    for (const d of bahasa) await Book.updateOne({ _id: d.buku._id }, { $set: { bahasa: d.bahasa } }, { timestamps: false });
    for (const d of catatan) {
      const deskripsi = [CATATAN, d.buku.deskripsi].filter(Boolean).join("\n\n").slice(0, 3000);
      await Book.updateOne({ _id: d.buku._id }, { $set: { deskripsi } }, { timestamps: false });
    }
    for (const d of pindah) await Book.updateOne({ _id: d.buku._id, kategori: d.kategori }, { $set: { kategori: d.ke } }, { timestamps: false });
  }
  const jumlah = simpan ? await perKategori() : akhir;
  log(`\nJumlah per kategori${simpan ? "" : " (perkiraan)"}, total ${Object.values(jumlah).reduce((a, b) => a + b, 0)}:`);
  for (const [k, n] of Object.entries(jumlah).sort((a, b) => b[1] - a[1])) log(`  ${String(n).padStart(4)}  ${k}`);
  log(simpan ? `Selesai: ${hapus.length} dihapus, ${pindah.length} dipindah, ${catatan.length} diberi catatan, ${bahasa.length} bahasa diperbaiki. Cadangan: ${cadangan}` : "Uji coba: tidak ada yang ditulis.");
  return { hapus: hapus.length, pindah: pindah.length, tinjau: tinjau.length, catatan: catatan.length, bahasa: bahasa.length, jumlah };
}

if (require.main === module) {
  (async () => {
    const opts = args(process.argv.slice(2));
    await connect(config.mongoUrl);
    await run(opts);
    await mongoose.disconnect();
  })().catch(async (e) => {
    console.error("Gagal:", e.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
}

module.exports = { run, args };
