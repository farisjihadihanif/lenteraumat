// Menyiapkan teks buku untuk LUMA dari laptop, supaya pertanyaan pertama di Vercel tidak menunggu PDF dibaca.
//
//   npm run indeks:teks                          -> uji coba: daftar buku, TIDAK mengunduh atau menulis
//   npm run indeks:teks -- --simpan              -> unduh PDF, ambil teksnya, simpan; jeda 2 detik antar unduhan
//   npm run indeks:teks -- --simpan --cepat      -> buku Internet Archive memakai teks OCR-nya (jauh lebih
//                                                   ringan, tapi LUMA tidak bisa menyebut nomor halaman)
//   npm run indeks:teks -- --simpan --jumlah 20  -> batasi jumlah buku sekali jalan
//
// Boleh dihentikan (Ctrl+C) kapan saja; jalankan lagi untuk melanjutkan. Tiap buku langsung disimpan.
const config = require("../src/config");
const { connect, mongoose } = require("../src/db");
const Book = require("../src/models/Book");
const BookText = require("../src/models/BookText");
const storage = require("../src/services/storage");
const { archiveText } = require("../src/services/bookFiles");
const { extractText } = require("../src/services/pdfText");

const JEDA = 2000;
const MAX_MB = 300;
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;
const isi = (text) => (text || "").replace(/\[Halaman \d+\]/g, "").trim();

function args(argv) {
  const jumlah = argv.includes("--jumlah") ? Number(argv[argv.indexOf("--jumlah") + 1]) : 0;
  if (argv.includes("--jumlah") && !(Number.isInteger(jumlah) && jumlah > 0)) throw new Error("Tulis --jumlah <angka>.");
  return { simpan: argv.includes("--simpan"), cepat: argv.includes("--cepat"), jumlah };
}

// Sudah punya teks, atau pernah dicatat tidak bisa dibaca (rusak / hasil scan).
const SELESAI = { $or: [{ text: { $ne: "" } }, { error: { $ne: "" } }] };

async function unduh(file) {
  const buffer = await storage.read(file, { maxMb: MAX_MB, timeoutMs: 20 * 60 * 1000 });
  if (buffer.subarray(0, 1024).indexOf("%PDF-") === -1) throw new Error("Sumber tidak mengirimkan file PDF.");
  return buffer;
}

async function dariPdf(file, jeda) {
  const buffer = await unduh(file).catch(async (e) => {
    if (e.status === 413) throw e;
    await tidur(jeda * 2); // gangguan jaringan sesaat: coba sekali lagi
    return unduh(file);
  });
  return extractText(buffer, 10 * 60 * 1000).catch((e) => {
    if (e.code === "PDF_TIMEOUT") throw e; // jangan dicatat sebagai gagal permanen
    return { text: "", pages: 0, error: e.message };
  });
}

async function ambilTeks(file, { cepat, jeda }) {
  if (cepat) {
    const ocr = await archiveText(file, 120 * 1000);
    if (ocr) return ocr;
  }
  const hasil = await dariPdf(file, jeda).catch((galat) => ({ text: "", galat }));
  const panjang = isi(hasil.text).length;
  if (panjang >= Math.max(50, 100 * (hasil.pages || 0))) return hasil;
  // Nyaris tanpa lapisan teks (mis. pindaian Google Books: hanya halaman pembuka), terlalu besar,
  // atau gagal diunduh: teks OCR Internet Archive bila lebih lengkap.
  const ocr = cepat ? null : await archiveText(file, 120 * 1000);
  if (ocr && ocr.text.length > panjang) return ocr;
  if (panjang >= 50) return hasil;
  if (hasil.galat) throw hasil.galat;
  return { ...hasil, error: hasil.error || "PDF tidak berisi teks (hasil scan)." };
}

async function run({ simpan = false, cepat = false, jumlah = 0, jeda = JEDA } = {}, log = console.log) {
  const sudah = new Set((await BookText.find(SELESAI).distinct("book")).map(String));
  const semua = await Book.find({ status: "disetujui" }).sort({ dibaca: -1, _id: 1 }).select("judul file").lean();
  const belum = semua.filter((b) => !sudah.has(String(b._id)));
  const antre = jumlah ? belum.slice(0, jumlah) : belum;
  const hasil = { selesai: 0, gagal: 0, dilewati: semua.length - belum.length };
  log(`Buku tayang: ${semua.length}; sudah diproses: ${hasil.dilewati}; akan diproses: ${antre.length} (${mb(antre.reduce((n, b) => n + (b.file.size || 0), 0))}).`);
  if (!simpan) {
    for (const b of antre) log(`  ${mb(b.file.size || 0).padStart(9)}  ${b.judul.slice(0, 90)}`);
    log("Uji coba: tidak ada yang diunduh atau ditulis. Tambahkan -- --simpan untuk menjalankan.");
    return hasil;
  }
  const gagal = [];
  for (const [i, b] of antre.entries()) {
    const label = `[${i + 1}/${antre.length}] ${b.judul.slice(0, 70)}`;
    try {
      // Bisa saja sudah disiapkan LUMA, atau bukunya dihapus, selama skrip berjalan.
      if ((await BookText.exists({ book: b._id, ...SELESAI })) || !(await Book.exists({ _id: b._id }))) {
        hasil.dilewati++;
        log(`${label}: dilewati`);
        continue;
      }
      const mulai = Date.now();
      const { text, pages, error = "" } = await ambilTeks(b.file, { cepat, jeda });
      await BookText.findOneAndUpdate({ book: b._id }, { text: error ? "" : text, pages, error }, { upsert: true });
      if (error) throw new Error(`${error} (dicatat, tidak dicoba lagi)`);
      hasil.selesai++;
      log(`${label}: ${pages ? `${pages} halaman` : "teks OCR"}, ${text.length} huruf, ${Math.round((Date.now() - mulai) / 1000)} dtk`);
    } catch (e) {
      hasil.gagal++;
      gagal.push(`  ${b._id} ${b.judul.slice(0, 80)}: ${e.message}`);
      log(`${label}: GAGAL, ${e.message}`);
    }
    if (i < antre.length - 1) await tidur(jeda);
  }
  if (gagal.length) log(`\nGagal:\n${gagal.join("\n")}`);
  log(`\nSelesai: ${hasil.selesai} berhasil, ${hasil.gagal} gagal, ${hasil.dilewati} dilewati.`);
  return hasil;
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
