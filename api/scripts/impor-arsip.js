// Isi perpustakaan dengan buku DOMAIN PUBLIK dari koleksi lembaga di Internet Archive
// (Smithsonian Libraries, Library of Congress, perpustakaan universitas, dll).
//
// Contoh:
//   npm run impor:arsip                               -> 30 buku populer campuran
//   npm run impor:arsip -- --topik islam --jumlah 50
//   npm run impor:arsip -- --bahasa melayu --jumlah 20
//   npm run impor:arsip -- --topik "natural history" --kering   (lihat daftar saja, tidak menyimpan)
//   npm run impor:arsip -- --topik islam --salin                (unduh & simpan salinan PDF; lambat)
//
// Mode bawaan CEPAT: hanya memanggil API Internet Archive (judul, penulis, sampul,
// jumlah halaman, tautan PDF). PDF tidak diunduh; saat dibaca, server mengambil
// bagian yang dibutuhkan saja dari arsip. Teks untuk LUMA diambil saat pertama dipakai.
//
// Jalankan di terminal KEDUA, biarkan server (npm run dev) tetap jalan.
//
// Aturan aman: hanya koleksi lembaga tepercaya, terbit 1500–1928 (domain publik),
// konten dewasa dikecualikan, atribusi sumber & lisensi dicatat di tiap buku.
const config = require("../src/config");
const { connect, mongoose } = require("../src/db");
const Book = require("../src/models/Book");
const User = require("../src/models/User");
const categories = require("../src/services/categories");
const importer = require("../src/services/importer");
const { storePdf, indexTextNow } = require("../src/services/bookFiles");

const TRUSTED = [
  "smithsonian", "biodiversity", "library_of_congress", "americana", "toronto", "university_of_toronto",
  "cdl", "cornell", "princeton", "mcgilluniversity", "michigan_books", "europeanlibraries", "nationallibraryofscotland",
];
const BAHASA = {
  inggris: "eng", indonesia: "ind", melayu: "(may OR Malay)", arab: "ara", belanda: "dut", jerman: "ger", prancis: "fre",
};
const BAHASA_NAMA = { eng: "Inggris", ind: "Indonesia", may: "Melayu", malay: "Melayu", ara: "Arab", dut: "Belanda", ger: "Jerman", fre: "Prancis", jpn: "Jepang", lat: "Latin" };

// Subjek (bahasa Inggris) -> kategori LenteraUmat. Urutan menentukan prioritas.
const CATEGORY_RULES = [
  [/juvenile|children/i, "Anak"],
  [/koran|qur.?an|tafsir/i, "Al-Qur'an & Tafsir"],
  [/hadith|hadis|sunnah/i, "Hadis"],
  [/islamic law|fiqh|fikih/i, "Fikih"],
  [/islam.*(history|histor)|caliph|ottoman|moors|crusade/i, "Sejarah Islam"],
  [/islam|muslim|muhammad|sufi|mosque/i, "Akidah & Akhlak"],
  [/biograph|memoir|autobiograph/i, "Biografi"],
  [/grammar|dictionar|language|vocabular|phrase/i, "Bahasa"],
  [/poetry|poems|fiction|novel|literature|drama|tales|stories/i, "Sastra"],
  [/\bart\b|arts|ornament|design|architecture|music|painting|pottery|costume|craft|textile|decoration/i, "Seni & Budaya"],
  [/education|textbook|school|teaching|study and teaching/i, "Pendidikan"],
  [/history|histor|antiquit|travel|voyage|description and travel/i, "Sejarah"],
  [/engineering|technology/i, "Teknologi"],
  [/science|botany|zoology|natural history|biology|chemistry|physics|astronomy|geology|mathematic|medicine|insect|bird|plant|animal|fishes|mineral/i, "Sains"],
];

function args(argv) {
  const out = { jumlah: 30, topik: "", bahasa: "", kering: false, salin: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--kering") out.kering = true;
    else if (a === "--salin") out.salin = true;
    else if (a.startsWith("--")) out[a.slice(2)] = argv[++i] ?? "";
  }
  out.jumlah = Math.max(1, Math.min(500, parseInt(out.jumlah, 10) || 30));
  return out;
}

const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const clean = (s) => String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function pickCategory(subjects, title) {
  const text = [...arr(subjects), title].join(" | ");
  for (const [rx, cat] of CATEGORY_RULES) if (rx.test(text)) return cat;
  return "Umum";
}

function buildQuery({ topik, bahasa }) {
  const parts = [
    "mediatype:texts",
    `collection:(${TRUSTED.join(" OR ")})`,
    "year:[1500 TO 1928]",
    "-collection:bannedbooks",
    "-subject:(erotic* OR sex OR sexual*)",
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
  const fl = ["identifier", "title", "creator", "subject", "year", "language", "publisher", "description", "licenseurl", "volume", "imagecount"];
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

const escapeRx = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Siapkan satu buku dari hasil pencarian: ambil metadata file, pilih PDF.
async function prepare(doc, opts, maxBytes) {
  const id = doc.identifier;
  const detailUrl = `https://archive.org/details/${id}`;
  if (await Book.exists({ sumberUrl: detailUrl })) return { skip: "sudah ada" };
  let title = clean(doc.title).replace(/\*/g, "");
  if (!title) return { skip: "tanpa judul" };
  const vol = clean(arr(doc.volume)[0]);
  if (vol && !/jilid|vol/i.test(title)) title = `${title} (Jilid ${vol})`;
  title = title.slice(0, 200);
  const year = parseInt(doc.year, 10) || undefined;
  if (await Book.exists({ judul: new RegExp(`^${escapeRx(title)}$`, "i"), tahunTerbit: year })) return { skip: "judul sama sudah ada" };
  const kategori = pickCategory(doc.subject, title);
  if (opts.kering) return { title, year, kategori, dry: true };
  const meta = await fetchJson(`https://archive.org/metadata/${encodeURIComponent(id)}`);
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
      lisensi: String(doc.licenseurl || "").includes("publicdomain") ? "Domain publik" : `Domain publik (terbit ${doc.year})`,
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
  const admin = await User.findOne({ role: "admin" }).sort({ createdAt: 1 });
  if (!admin) throw new Error("Belum ada akun admin. Jalankan server sekali dengan ADMIN_EMAIL & ADMIN_PASSWORD di .env.");
  // Mode cepat cukup menautkan, jadi PDF besar pun bisa (dibaca per bagian).
  const maxBytes = (opts.salin ? config.maxPdfMb : Math.max(config.maxPdfMb, 200)) * 1024 * 1024;
  const PARALLEL = opts.salin ? 1 : 6;
  let added = 0;
  let page = 1;
  let seen = 0;
  const started = Date.now();
  log(`Mencari buku domain publik${opts.topik ? ` tentang "${opts.topik}"` : ""}${opts.bahasa ? ` berbahasa ${opts.bahasa}` : ""}${opts.salin ? " (mode salin: mengunduh PDF)" : ""}...`);
  while (added < opts.jumlah) {
    const { docs, numFound } = await search(opts, page, 50);
    if (page === 1) log(`Ditemukan ${numFound.toLocaleString("id-ID")} buku di arsip. Mengambil ${opts.jumlah}.`);
    if (!docs.length) break;
    for (let i = 0; i < docs.length && added < opts.jumlah; i += PARALLEL) {
      const batch = docs.slice(i, i + PARALLEL);
      seen += batch.length;
      const prepared = await Promise.all(batch.map((d) => prepare(d, opts, maxBytes).catch((e) => ({ skip: e.message, title: clean(d.title) }))));
      for (const item of prepared) {
        if (added >= opts.jumlah) break;
        if (item.skip) {
          if (item.title) log(`  - lewati "${item.title}": ${item.skip}`);
          continue;
        }
        if (item.dry) {
          added++;
          log(`  [${added}] ${item.title} (${item.year}) -> ${item.kategori}`);
          continue;
        }
        try {
          const { book, linked } = await save(item, opts, admin);
          added++;
          log(`  [${added}/${opts.jumlah}] ${item.title} (${item.year}) -> ${book.kategori}${opts.salin && linked ? " [ditautkan]" : ""}`);
        } catch (error) {
          log(`  - gagal "${item.title}": ${error.message}`);
        }
      }
    }
    page++;
    if (seen >= numFound) break;
  }
  const secs = Math.round((Date.now() - started) / 1000);
  log(opts.kering ? "Selesai (uji coba, tidak ada yang disimpan)." : `Selesai: ${added} buku ditambahkan dalam ${secs} detik.`);
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

module.exports = { run, args, buildQuery, pickCategory, pickPdf, setFetchJson: (fn) => (fetchJson = fn) };
