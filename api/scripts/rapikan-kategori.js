// Merapikan kategori: pindahkan semua buku dari kategori lama ke tujuan, lalu hapus kategori lama,
// ditambah pemindahan buku satu per satu (PINDAH). Tujuan yang belum ada dibuat bila termasuk kategori bawaan.
//
//   npm run rapikan:kategori                                   -> uji coba: laporan & rencana, TIDAK menulis apa pun
//   npm run rapikan:kategori -- --simpan                       -> jalankan rencana
//   npm run rapikan:kategori -- --gabung "Anak=Umum"           -> tambah penggabungan (boleh diulang)
//
// Tanpa --gabung hanya GABUNG dan PINDAH di bawah yang dijalankan. Aman diulang.
const config = require("../src/config");
const { connect, mongoose } = require("../src/db");
const Book = require("../src/models/Book");
const Category = require("../src/models/Category");
const { FALLBACK, DEFAULTS } = require("../src/services/categories");

const GABUNG = [
  ["Sains & Teknologi", "Teknologi"],
  ["Pendidikan Islam", "Pendidikan"],
];
// [kategori asal, kategori tujuan, judul persis]; kategori asal tidak dihapus.
const PINDAH = [
  ["Umum", "Pendidikan", "Penguatan Kultur Literasi di Madrasah Berbasis Riset melalui Optimalisasi Fungsi Perpustakaan di MTs Negeri 1 Kota Batu"],
  ["Umum", "Pendidikan", "Upaya Peningkatan Kemampuan Literasi Digital bagi Tenaga Perpustakaan Sekolah dan Guru di Wilayah Jakarta Pusat melalui Pelatihan Literasi Informasi"],
  ["Pengembangan Diri", "Pendidikan", "Motivasi Belajar Mahasiswa Universitas Nahdlatul Ulama NTB di Masa Pandemi Covid-19"],
  ["Pengembangan Diri", "Pendidikan", "Manajemen Waktu dan Kecemasan Matematis: Studi Korelasional terhadap Capaian Prestasi Belajar Siswa"],
  ["Pengembangan Diri", "Pendidikan", "Hubungan Aktivitas Agama terhadap Motivasi Belajar Siswa SMK An Nur Al Muntahy Kecamatan Banyuates Kabupaten Sampang"],
];
const MINIMAL = 8;
// Pendapat hasil tinjauan manual; hanya ditampilkan, tidak dijalankan tanpa --gabung.
const TINJAUAN = {
  "Sejarah|Sejarah Islam": "biarkan terpisah (sejarah umum dan sejarah Islam)",
};

function args(argv) {
  const out = { simpan: argv.includes("--simpan"), gabung: [...GABUNG] };
  argv.forEach((a, i) => {
    if (a !== "--gabung") return;
    const [dari, ke, lebih] = String(argv[i + 1] || "").split("=").map((s) => s.trim());
    if (!dari || !ke || lebih !== undefined) throw new Error('Tulis --gabung "Kategori Lama=Kategori Tujuan".');
    out.gabung.push([dari, ke]);
  });
  return out;
}

const kata = (nama) =>
  nama
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/\b(fiqih|fiqh)\b/g, "fikih")
    .replace(/\bhadits\b/g, "hadis")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && w !== "dan");

function jarak(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}

// "sama", "mirip" (beda ejaan), "bagian" (kata yang satu termuat di yang lain), atau "".
function kemiripan(a, b) {
  const [x, y] = [kata(a), kata(b)];
  const [s, t] = [x.join(" "), y.join(" ")];
  if (s === t) return "sama";
  if (Math.min(s.length, t.length) >= 5 && jarak(s, t) <= 2) return "mirip";
  const [kecil, besar] = x.length <= y.length ? [x, y] : [y, x];
  return kecil.length && kecil.every((w) => besar.includes(w)) ? "bagian" : "";
}

async function hitung() {
  const n = Object.fromEntries((await Book.aggregate([{ $group: { _id: "$kategori", n: { $sum: 1 } } }])).map((r) => [r._id, r.n]));
  const daftar = (await Category.find().sort({ urutan: 1, nama: 1 }).lean()).map((c) => ({ nama: c.nama, n: n[c.nama] || 0, ada: true }));
  for (const [nama, jumlah] of Object.entries(n)) if (!daftar.some((c) => c.nama === nama)) daftar.push({ nama, n: jumlah, ada: false });
  return daftar;
}

async function run({ simpan = false, gabung = GABUNG, pindah = PINDAH } = {}, log = console.log) {
  const asal = await hitung();
  log("Kategori saat ini:");
  for (const c of asal) log(`  ${String(c.n).padStart(4)}  ${c.nama}${c.ada ? "" : "  (tidak ada di daftar kategori!)"}`);

  log("\nMirip / ganda:");
  const pasangan = [];
  asal.forEach((a, i) =>
    asal.slice(i + 1).forEach((b) => {
      const jenis = kemiripan(a.nama, b.nama);
      if (!jenis) return;
      pasangan.push([a.nama, b.nama]);
      const diputus = gabung.find(([d]) => d === a.nama || d === b.nama);
      const [kecil, besar] = a.n <= b.n ? [a, b] : [b, a];
      const saran = diputus
        ? `sudah di rencana: ${diputus.join(" -> ")}`
        : TINJAUAN[`${a.nama}|${b.nama}`] || TINJAUAN[`${b.nama}|${a.nama}`] || `usul: --gabung "${kecil.nama}=${besar.nama}"`;
      log(`  ${a.nama} (${a.n}) ~ ${b.nama} (${b.n}) [${jenis}]: ${saran}`);
    }),
  );
  if (!pasangan.length) log("  tidak ada");

  // Periksa seluruh rencana sebelum menulis apa pun.
  const ada = (nama) => asal.some((c) => c.nama === nama && c.ada);
  for (const [dari, ke] of gabung) {
    if (dari === FALLBACK) throw new Error(`Kategori "${FALLBACK}" tidak bisa dihapus.`);
    if (dari === ke || gabung.some(([d]) => d === ke)) throw new Error(`Tujuan "${ke}" juga akan dihapus.`);
  }
  for (const [, ke] of [...gabung, ...pindah]) if (!ada(ke) && !DEFAULTS.includes(ke)) throw new Error(`Kategori tujuan "${ke}" tidak ada.`);
  for (const [, ke] of pindah) if (gabung.some(([d]) => d === ke)) throw new Error(`Tujuan "${ke}" juga akan dihapus.`);

  log(`\n${simpan ? "Menjalankan" : "Rencana"}:`);
  let dipindah = 0;
  let dihapus = 0;
  const akhir = Object.fromEntries(asal.map((c) => [c.nama, c.n]));
  const dibuat = new Set();
  const siapkan = async (ke) => {
    if (ada(ke) || dibuat.has(ke)) return;
    log(`  buat kategori "${ke}"`);
    dibuat.add(ke);
    akhir[ke] ??= 0;
    if (simpan) await Category.create({ nama: ke, urutan: DEFAULTS.indexOf(ke) });
  };
  for (const [dari, ke] of gabung) {
    const buku = await Book.find({ kategori: dari }).select("judul").lean();
    const adaDari = ada(dari);
    if (!buku.length && !adaDari) {
      log(`  ${dari} -> ${ke}: sudah beres`);
      continue;
    }
    await siapkan(ke);
    log(`  ${dari} -> ${ke}: ${buku.length} buku${adaDari ? `, lalu hapus "${dari}"` : ""}`);
    for (const b of buku) log(`      - ${b.judul}`);
    if (simpan) {
      await Book.updateMany({ kategori: dari }, { $set: { kategori: ke } }, { timestamps: false });
      await Category.deleteOne({ nama: dari });
    }
    dipindah += buku.length;
    dihapus += adaDari ? 1 : 0;
    akhir[ke] += buku.length;
    delete akhir[dari];
  }
  for (const [dari, ke, judul] of pindah) {
    const n = await Book.countDocuments({ kategori: dari, judul });
    if (!n) {
      log(`  ${dari} -> ${ke}: tidak ada / sudah beres: ${judul}`);
      continue;
    }
    await siapkan(ke);
    log(`  ${dari} -> ${ke}: ${n} buku\n      - ${judul}`);
    if (simpan) await Book.updateMany({ kategori: dari, judul }, { $set: { kategori: ke } }, { timestamps: false });
    dipindah += n;
    akhir[ke] += n;
    akhir[dari] -= n;
  }

  log(`\nJumlah akhir per kategori${simpan ? "" : " (perkiraan)"}:`);
  for (const [k, n] of Object.entries(akhir)) log(`  ${String(n).padStart(4)}  ${k}`);
  const tipis = Object.entries(akhir).filter(([, n]) => n < MINIMAL);
  log(`\nSesudahnya di bawah ${MINIMAL} buku: ${tipis.map(([k, n]) => `${k} ${n}`).join(", ") || "tidak ada"}`);
  log(simpan ? `Selesai: ${dipindah} buku dipindah, ${dihapus} kategori dihapus.` : "Uji coba: tidak ada yang ditulis; pakai --simpan untuk menjalankan.");
  return { dipindah, dihapus, pasangan, tipis, akhir };
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

module.exports = { run, args, kemiripan };
