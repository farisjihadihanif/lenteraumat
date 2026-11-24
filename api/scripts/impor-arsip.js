// Isi perpustakaan dengan buku DOMAIN PUBLIK dari koleksi lembaga di Internet Archive
// (Smithsonian Libraries, Library of Congress, perpustakaan universitas, dll).
//
// Contoh:
//   npm run impor:arsip                               -> uji coba 30 buku: daftar saja, TIDAK menulis apa pun
//   npm run impor:arsip -- --topik islam --jumlah 50
//   npm run impor:arsip -- --bahasa melayu --jumlah 20 --simpan           (tampilkan daftar, lalu simpan)
//   npm run impor:arsip -- --topik islam --simpan --salin                 (unduh & simpan salinan PDF; lambat)
//
// Mode bawaan CEPAT: hanya memanggil API Internet Archive (judul, penulis, sampul,
// jumlah halaman, tautan PDF). PDF tidak diunduh; saat dibaca, server mengambil
// bagian yang dibutuhkan saja dari arsip. Teks untuk LUMA diambil saat pertama dipakai.
//
// Jalankan di terminal KEDUA, biarkan server (npm run dev) tetap jalan.
//
// Aturan aman (src/services/arsip.js): hanya koleksi lembaga tepercaya; tahun dihitung dari jilid itu
// sendiri, bukan awal seri (1929 ke atas atau tidak pasti = dilewati); hak cipta tidak jelas, okultisme,
// kebencian, misinformasi kesehatan, konten dewasa, dan karya yang sudah ada di katalog dilewati.
const config = require("../src/config");
const { connect, mongoose } = require("../src/db");
const Book = require("../src/models/Book");
const User = require("../src/models/User");
const categories = require("../src/services/categories");
const importer = require("../src/services/importer");
const { storePdf, indexTextNow } = require("../src/services/bookFiles");
const arsip = require("../src/services/arsip");

// Buku yang sudah ditolak lewat audit tidak boleh masuk lagi (mis. cetakan ulang yang tahunnya di arsip keliru).
const DITOLAK = new Set(require("../data/audit-arsip-2026-11-24.json").filter((d) => d.aksi === "hapus").map((d) => d.arsip));

const TRUSTED = [
  "smithsonian", "biodiversity", "library_of_congress", "americana", "toronto", "university_of_toronto",
  "cdl", "cornell", "princeton", "mcgilluniversity", "michigan_books", "europeanlibraries", "nationallibraryofscotland",
];
const BAHASA = {
  inggris: "eng", indonesia: "ind", melayu: "(may OR Malay)", arab: "ara", belanda: "dut", jerman: "ger", prancis: "fre",
};
const BAHASA_NAMA = { eng: "Inggris", ind: "Indonesia", may: "Melayu", malay: "Melayu", ara: "Arab", dut: "Belanda", ger: "Jerman", fre: "Prancis", jpn: "Jepang", lat: "Latin" };

function args(argv) {
  const out = { jumlah: 30, topik: "", bahasa: "", simpan: false, salin: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--simpan") out.simpan = true;
    else if (a === "--kering") out.kering = true; // sekarang bawaan; selalu menang atas --simpan
    else if (a === "--salin") out.salin = true;
    else if (a.startsWith("--")) out[a.slice(2)] = argv[++i] ?? "";
  }
  if (out.kering) out.simpan = false;
  out.jumlah = Math.max(1, Math.min(500, parseInt(out.jumlah, 10) || 30));
  return out;
}

const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const clean = (s) => String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function buildQuery({ topik, bahasa }) {
  const parts = [
    "mediatype:texts",
    `collection:(${TRUSTED.join(" OR ")})`,
    `year:[1500 TO ${arsip.TAHUN_MAKS}]`,
    "-collection:bannedbooks",
    "-subject:(erotic* OR sex OR sexual* OR occultism OR magic OR witchcraft)",
  ];
  if (bahasa) parts.push(`language:${BAHASA[bahasa.toLowerCase()] || bahasa}`);
  if (topik) parts.push(`(subject:(${topik}) OR title:(${topik}))`);
  return parts.join(" AND ");
}

let fetchJson = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(60000), headers: { "User-Agent": "LenteraUmat/2.0 (perpustakaan digital)" } });
  if (!res.ok) throw new Error(`Internet Archive menolak (${res.status})`);
  return res.json();
};

async function search(opts, page, rows) {
  const fl = ["identifier", "title", "creator", "subject", "year", "language", "publisher", "description", "licenseurl", "date", "volume", "imagecount"];
  const qs = new URLSearchParams({ q: buildQuery(opts), rows: String(rows), page: String(page), output: "json" });
  fl.forEach((f) => qs.append("fl[]", f));
  qs.append("sort[]", "downloads desc");
  const data = await fetchJson(`https://archive.org/advancedsearch.php?${qs}`);
  return data.response;
}

// Pilih PDF berteks (OCR) supaya LUMA bisa membacanya.
function pickPdf(files, maxBytes) {
  const pdfs = files.filter((f) => /\.pdf$/i.test(f.name) && !/_bw\.pdf$/i.test(f.name));
  const rank = (f) => (f.format === "Text PDF" ? 0 : /Additional Text PDF/.test(f.format || "") ? 1 : 2);
  return pdfs.sort((a, b) => rank(a) - rank(b) || Number(a.size) - Number(b.size)).find((f) => Number(f.size || 0) <= maxBytes);
}

// Siapkan satu buku dari hasil pencarian: periksa aturan, ambil metadata file, pilih PDF.
async function prepare(doc, maxBytes) {
  const id = doc.identifier;
  const detailUrl = `https://archive.org/details/${id}`;
  let title = clean(doc.title).replace(/\*/g, "");
  if (!title) return { skip: "tanpa judul" };
  const vol = clean(arr(doc.volume)[0]);
  if (vol && !/jilid|vol/i.test(title)) title = `${title.slice(0, 200 - vol.length - 9)} (Jilid ${vol})`;
  title = title.slice(0, 200);
  if (DITOLAK.has(id)) return { skip: "sudah ditolak saat audit", title };
  if (await Book.exists({ sumberUrl: detailUrl })) return { skip: "sudah ada", title };
  // Cukup dari hasil pencarian: tidak perlu membuka metadata.
  const terlarang = arsip.topikTerlarang(doc);
  if (terlarang) return { skip: terlarang, title };
  const meta = await fetchJson(`https://archive.org/metadata/${encodeURIComponent(id)}`);
  const m = { ...doc, ...meta.metadata };
  const alasan = arsip.topikTerlarang(m) || arsip.masalahHak(m);
  if (alasan) return { skip: alasan, title };
  const { tahun: year, alasan: alasanTahun } = arsip.tahunAsli(m);
  if (alasanTahun) return { skip: alasanTahun, title };
  const kategori = arsip.pilihKategori(m.subject, title);
  const file = pickPdf(meta.files || [], maxBytes);
  if (!file) return { skip: `tidak ada PDF ≤ ${Math.round(maxBytes / 1048576)} MB`, title };
  const pdfUrl = `https://archive.org/download/${encodeURIComponent(id)}/${encodeURIComponent(file.name)}`;
  const langCode = String(arr(doc.language)[0] || "").toLowerCase();
  return {
    title,
    year,
    kategori,
    pdfUrl,
    data: {
      judul: title,
      penulis: clean(arr(doc.creator)[0]).slice(0, 150) || "Tidak diketahui",
      penerbit: clean(arr(doc.publisher)[0]).slice(0, 150),
      tahunTerbit: year,
      bahasa: BAHASA_NAMA[langCode] || (langCode ? langCode : "Inggris"),
      deskripsi: clean(arr(doc.description).join(" ")).slice(0, 3000),
      cover: `https://archive.org/services/img/${encodeURIComponent(id)}`,
      halaman: parseInt(meta.metadata?.imagecount || doc.imagecount, 10) || 0,
      asalPdf: pdfUrl,
      sumber: "Internet Archive",
      sumberUrl: detailUrl,
      lisensi: String(m.licenseurl || "").includes("publicdomain") ? "Domain publik" : `Domain publik (terbit ${year})`,
      file: { url: pdfUrl, storage: "external", key: "", size: Number(file.size) || 0 },
    },
  };
}

async function save(item, opts, admin) {
  const data = { ...item.data, kategori: await categories.resolve(item.kategori, { create: true }) };
  let linked = true;
  let buffer = null;
  if (opts.salin) {
    ({ buffer } = await importer.downloadPdf(item.pdfUrl));
    const r = await storePdf(buffer, `${item.title}.pdf`, { sourceUrl: item.pdfUrl });
    data.file = r.stored;
    data.halaman = r.halaman;
    linked = r.linked;
  }
  const book = await Book.create({ ...data, uploadedBy: admin._id, status: "disetujui", reviewedBy: admin._id, reviewedAt: new Date() });
  if (buffer) await indexTextNow(book._id, buffer);
  return { book, linked };
}

async function run(opts, log = console.log) {
  const admin = opts.simpan ? await User.findOne({ role: "admin" }).sort({ createdAt: 1 }) : null;
  if (opts.simpan && !admin) throw new Error("Belum ada akun admin. Jalankan server sekali dengan ADMIN_EMAIL & ADMIN_PASSWORD di .env.");
  // Mode cepat cukup menautkan, jadi PDF besar pun bisa (dibaca per bagian).
  const maxBytes = (opts.salin ? config.maxPdfMb : Math.max(config.maxPdfMb, 200)) * 1024 * 1024;
  const PARALLEL = 6;
  const pencatat = arsip.buatPencatat();
  for (const b of await Book.find().select("judul penulis tahunTerbit").lean()) pencatat.tambah({ judul: b.judul, penulis: b.penulis, tahun: b.tahunTerbit });

  log(`Mencari buku domain publik${opts.topik ? ` tentang "${opts.topik}"` : ""}${opts.bahasa ? ` berbahasa ${opts.bahasa}` : ""}...`);
  const terpilih = [];
  let page = 1;
  let seen = 0;
  while (terpilih.length < opts.jumlah) {
    const { docs, numFound } = await search(opts, page, 50);
    if (page === 1) log(`Ditemukan ${numFound.toLocaleString("id-ID")} buku di arsip. Mencari ${opts.jumlah} yang lolos aturan.`);
    if (!docs.length) break;
    for (let i = 0; i < docs.length && terpilih.length < opts.jumlah; i += PARALLEL) {
      const batch = docs.slice(i, i + PARALLEL);
      seen += batch.length;
      const prepared = await Promise.all(batch.map((d) => prepare(d, maxBytes).catch((e) => ({ skip: e.message, title: clean(d.title) }))));
      for (const item of prepared) {
        if (terpilih.length >= opts.jumlah) break;
        const karya = item.skip ? null : { judul: item.title, penulis: item.data.penulis, tahun: item.year };
        const skip = item.skip || pencatat.tolak(karya);
        if (skip) {
          if (item.title) log(`  - lewati "${item.title}": ${skip}`);
          continue;
        }
        pencatat.tambah(karya);
        terpilih.push(item);
      }
    }
    page++;
    if (seen >= numFound) break;
  }

  log(`\nDaftar (${terpilih.length} buku):`);
  terpilih.forEach((t, i) => log(`  [${i + 1}] ${t.title} (${t.year}) | ${t.data.penulis} | ${t.kategori}`));
  if (!opts.simpan) {
    log("Uji coba: tidak ada yang disimpan; pakai --simpan untuk menyimpan.");
    return terpilih.length;
  }
  const started = Date.now();
  let added = 0;
  for (const item of terpilih) {
    try {
      const { linked } = await save(item, opts, admin);
      added++;
      if (opts.salin) log(`  tersimpan ${added}/${terpilih.length}${linked ? " [ditautkan]" : ""}`);
    } catch (error) {
      log(`  - gagal "${item.title}": ${error.message}`);
    }
  }
  log(`Selesai: ${added} buku ditambahkan dalam ${Math.round((Date.now() - started) / 1000)} detik.`);
  return added;
}

if (require.main === module) {
  const opts = args(process.argv.slice(2));
  connect(config.mongoUrl)
    .then(() => run(opts))
    .then(() => mongoose.disconnect())
    .catch(async (e) => {
      console.error("Impor gagal:", e.message);
      await mongoose.disconnect().catch(() => {});
      process.exit(1);
    });
}

module.exports = { run, args, buildQuery, pickPdf, setFetchJson: (fn) => (fetchJson = fn) };
