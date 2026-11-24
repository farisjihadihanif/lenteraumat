// Merapikan kategori: pindahkan semua buku dari kategori lama ke tujuan, lalu hapus kategori lama.
//
//   npm run rapikan:kategori                                   -> uji coba: laporan & rencana, TIDAK menulis apa pun
//   npm run rapikan:kategori -- --simpan                       -> jalankan rencana
//   npm run rapikan:kategori -- --gabung "Pendidikan=Umum"     -> tambah penggabungan (boleh diulang)
//
// Tanpa --gabung hanya GABUNG di bawah yang dijalankan. Aman diulang.
const config = require("../src/config");
const { connect, mongoose } = require("../src/db");
const Book = require("../src/models/Book");
const Category = require("../src/models/Category");
const { FALLBACK } = require("../src/services/categories");

const GABUNG = [["Sains & Teknologi", "Teknologi"]];
const MINIMAL = 8;
// Pendapat hasil tinjauan manual; hanya ditampilkan, tidak dijalankan tanpa --gabung.
const TINJAUAN = {
  "Pendidikan|Pendidikan Islam": 'usul: --gabung "Pendidikan=Umum" (satu-satunya bukunya, The Didache, bukan buku pendidikan Islam)',
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

async function run({ simpan = false, gabung = GABUNG } = {}, log = console.log) {
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
  for (const [dari, ke] of gabung) {
    if (dari === FALLBACK) throw new Error(`Kategori "${FALLBACK}" tidak bisa dihapus.`);
    if (dari === ke || gabung.some(([d]) => d === ke)) throw new Error(`Tujuan "${ke}" juga akan dihapus.`);
    if (!asal.some((c) => c.nama === ke && c.ada)) throw new Error(`Kategori tujuan "${ke}" tidak ada.`);
  }

  log(`\n${simpan ? "Menjalankan" : "Rencana"}:`);
  let dipindah = 0;
  let dihapus = 0;
  for (const [dari, ke] of gabung) {
    const buku = await Book.find({ kategori: dari }).select("judul").lean();
    const ada = asal.some((c) => c.nama === dari && c.ada);
    if (!buku.length && !ada) {
      log(`  ${dari} -> ${ke}: sudah beres`);
      continue;
    }
    log(`  ${dari} -> ${ke}: ${buku.length} buku${ada ? `, lalu hapus "${dari}"` : ""}`);
    for (const b of buku) log(`      - ${b.judul}`);
    if (simpan) {
      await Book.updateMany({ kategori: dari }, { $set: { kategori: ke } }, { timestamps: false });
      await Category.deleteOne({ nama: dari });
    }
    dipindah += buku.length;
    dihapus += ada ? 1 : 0;
  }

  const akhir = Object.fromEntries(asal.map((c) => [c.nama, c.n]));
  for (const [dari, ke] of gabung) {
    if (!(dari in akhir)) continue;
    akhir[ke] += akhir[dari];
    delete akhir[dari];
  }
  const tipis = Object.entries(akhir).filter(([, n]) => n < MINIMAL);
  log(`\nSesudahnya di bawah ${MINIMAL} buku: ${tipis.map(([k, n]) => `${k} ${n}`).join(", ") || "tidak ada"}`);
  log(simpan ? `Selesai: ${dipindah} buku dipindah, ${dihapus} kategori dihapus.` : "Uji coba: tidak ada yang ditulis; pakai --simpan untuk menjalankan.");
  return { dipindah, dihapus, pasangan, tipis };
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
