// Isi perpustakaan dengan buku DOMAIN PUBLIK dari koleksi lembaga di Internet Archive
// (Smithsonian Libraries, Library of Congress, perpustakaan universitas, dll).
//
// Contoh:
//   npm run impor:arsip                               -> 30 buku populer campuran
//   npm run impor:arsip -- --topik islam --jumlah 50
//   npm run impor:arsip -- --bahasa melayu --jumlah 20
//   npm run impor:arsip -- --topik "natural history" --kering   (lihat daftar saja, tidak menyimpan)
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
  [/science|botany|zoology|natural history|biology|chemistry|physics|astronomy|geology|mathematic|engineering|technology|medicine|insect|bird|plant|animal|fishes|mineral/i, "Sains & Teknologi"],
];

function args(argv) {
  const out = { jumlah: 30, topik: "", bahasa: "", kering: false, tautan: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--kering") out.kering = true;
    else if (a === "--tautan") out.tautan = true;
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
  const fl = ["identifier", "title", "creator", "subject", "year", "language", "publisher", "description", "licenseurl"];
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

async function run(opts, log = console.log) {
  const admin = await User.findOne({ role: "admin" }).sort({ createdAt: 1 });
  if (!admin) throw new Error("Belum ada akun admin. Jalankan server sekali dengan ADMIN_EMAIL & ADMIN_PASSWORD di .env.");
  const maxBytes = config.maxPdfMb * 1024 * 1024;
  let added = 0;
  let page = 1;
  let seen = 0;
  log(`Mencari buku domain publik${opts.topik ? ` tentang "${opts.topik}"` : ""}${opts.bahasa ? ` berbahasa ${opts.bahasa}` : ""}...`);
  while (added < opts.jumlah) {
    const { docs, numFound } = await search(opts, page, 50);
    if (page === 1) log(`Ditemukan ${numFound.toLocaleString("id-ID")} buku di arsip. Mengambil ${opts.jumlah}.`);
    if (!docs.length) break;
    for (const doc of docs) {
      if (added >= opts.jumlah) break;
      seen++;
      const id = doc.identifier;
      const detailUrl = `https://archive.org/details/${id}`;
      if (await Book.exists({ sumberUrl: detailUrl })) continue;
      const title = clean(doc.title).replace(/\*/g, "").slice(0, 200);
      if (!title) continue;
      const kategori = pickCategory(doc.subject, title);
      if (opts.kering) {
        added++;
        log(`  [${added}] ${title} (${doc.year}) -> ${kategori}`);
        continue;
      }
      try {
        const meta = await fetchJson(`https://archive.org/metadata/${encodeURIComponent(id)}`);
        const file = pickPdf(meta.files || [], maxBytes);
        if (!file) {
          log(`  - lewati "${title}": tidak ada PDF ≤ ${config.maxPdfMb} MB`);
          continue;
        }
        const pdfUrl = `https://archive.org/download/${encodeURIComponent(id)}/${encodeURIComponent(file.name)}`;
        const { buffer } = await importer.downloadPdf(pdfUrl);
        const { stored, halaman, linked } = await storePdf(buffer, `${id}.pdf`, { sourceUrl: pdfUrl, link: opts.tautan });
        const langCode = String(arr(doc.language)[0] || "").toLowerCase();
        const book = await Book.create({
          judul: title,
          penulis: clean(arr(doc.creator)[0]).slice(0, 150) || "Tidak diketahui",
          penerbit: clean(arr(doc.publisher)[0]).slice(0, 150),
          tahunTerbit: parseInt(doc.year, 10) || undefined,
          bahasa: BAHASA_NAMA[langCode] || (langCode ? langCode : "Inggris"),
          kategori: await categories.resolve(kategori, { create: true }),
          deskripsi: clean(arr(doc.description).join(" ")).slice(0, 3000),
          cover: `https://archive.org/services/img/${encodeURIComponent(id)}`,
          file: stored,
          halaman,
          asalPdf: pdfUrl,
          sumber: "Internet Archive",
          sumberUrl: detailUrl,
          lisensi: String(doc.licenseurl || "").includes("publicdomain") ? "Domain publik" : `Domain publik (terbit ${doc.year})`,
          uploadedBy: admin._id,
          status: "disetujui",
          reviewedBy: admin._id,
          reviewedAt: new Date(),
        });
        await indexTextNow(book._id, buffer);
        added++;
        log(`  [${added}/${opts.jumlah}] ${title} (${doc.year}) -> ${book.kategori}${linked ? " [ditautkan]" : ""}`);
      } catch (error) {
        log(`  - gagal "${title}": ${error.message}`);
      }
    }
    page++;
    if (seen >= numFound) break;
  }
  log(opts.kering ? `Selesai (uji coba, tidak ada yang disimpan).` : `Selesai: ${added} buku ditambahkan.`);
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
