// Impor katalog awal dari daftar yang sudah ditinjau: api/data/katalog.json.
//
//   npm run impor:katalog                  -> uji coba: cek & tampilkan daftar, TIDAK menulis apa pun
//   npm run impor:katalog -- --cek-tautan  -> uji coba + buka tiap PDF (jeda minimal 2 detik)
//   npm run impor:katalog -- --simpan      -> tulis ke database & unggah sampul
//
// Aman diulang: buku yang PDF, halaman sumber, atau judul & tahunnya sudah ada dilewati.
// Hapus entri (atau isi "lewati": true) di katalog.json untuk tidak mengimpornya.
// PDF tidak disalin: file.storage = "external", yang disimpan hanya tautan aslinya.
const fs = require("fs");
const path = require("path");
const config = require("../src/config");
const { connect, mongoose } = require("../src/db");
const Book = require("../src/models/Book");
const User = require("../src/models/User");
const categories = require("../src/services/categories");
const importer = require("../src/services/importer");
const storage = require("../src/services/storage");
const { storePdf, indexTextNow } = require("../src/services/bookFiles");
const { typographicCover, firstPageCover } = require("../src/services/cover");
const { escapeRegex } = require("../src/util");

const FILE = path.join(__dirname, "..", "data", "katalog.json");
// Hanya CC BY / CC BY-SA / CC BY-NC, domain publik, dan CC0.
// Buku pemerintah wajib menyertakan kutipan izinnya di lisensiBukti.
const CC = /^https:\/\/creativecommons\.org\/(?:licenses\/(by|by-sa|by-nc)\/(\d\.\d)|publicdomain\/(zero|mark)\/1\.0)\//;
const NAMA_CC = { by: "CC BY", "by-sa": "CC BY-SA", "by-nc": "CC BY-NC" };
const JEDA = 2100;
const WAJIB = ["judul", "penulis", "tahunTerbit", "penerbit", "kategori", "deskripsi", "sumber", "sumberUrl", "pdfUrl", "lisensi", "lisensiUrl", "sitasi"];
const MAKS = { judul: 200, penulis: 150, penerbit: 150, sumber: 150, lisensi: 150, sitasi: 1500, sumberUrl: 500, lisensiUrl: 300, kategori: 60, deskripsi: 3000 };
const HTTP = /^https?:\/\/[^\s"'<>]+$/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function args(argv) {
  return { simpan: argv.includes("--simpan"), cekTautan: argv.includes("--cek-tautan") };
}

// Daftar masalah pada satu entri; kosong = boleh diimpor.
function periksa(item) {
  const salah = WAJIB.filter((k) => !item[k]).map((k) => `${k} kosong`);
  for (const k of ["sumberUrl", "pdfUrl", "lisensiUrl"]) if (item[k] && !HTTP.test(item[k])) salah.push(`${k} bukan tautan http(s)`);
  if (item.lisensiUrl) {
    const cc = CC.exec(item.lisensiUrl);
    if (cc) {
      const nama = cc[1] && `${NAMA_CC[cc[1]]} ${cc[2]}`;
      if (nama && item.lisensi !== nama) salah.push(`nama lisensi "${item.lisensi}" tidak cocok dengan tautannya`);
    } else if (!(item.jenis === "pemerintah" && item.lisensiBukti)) salah.push("lisensi tidak termasuk yang diizinkan");
  }
  for (const [k, max] of Object.entries(MAKS)) if (String(item[k] || "").length > max) salah.push(`${k} lebih dari ${max} huruf`);
  return salah;
}

function muat(file = FILE) {
  const items = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(items)) throw new Error("katalog.json harus berupa daftar (array).");
  const seen = new Set();
  return items.map((item) => {
    const salah = periksa(item);
    for (const url of new Set([item.pdfUrl, item.sumberUrl].filter(Boolean))) {
      if (seen.has(url)) salah.push(`tautan ganda di katalog.json: ${url}`);
      seen.add(url);
    }
    return { item, salah };
  });
}

const sudahAda = (item) =>
  Book.exists({
    $or: [
      { asalPdf: item.pdfUrl },
      { sumberUrl: item.sumberUrl },
      { judul: new RegExp(`^${escapeRegex(item.judul)}$`, "i"), tahunTerbit: item.tahunTerbit },
    ],
  });

async function simpan(item, admin) {
  const { buffer } = await importer.downloadPdf(item.pdfUrl, { maxMb: 150 });
  const { stored, halaman } = await storePdf(buffer, "buku.pdf", { sourceUrl: item.pdfUrl, link: true });
  const kategori = await categories.resolve(item.kategori, { create: true });
  const gambar = item.sampul === "halaman-pertama" ? await firstPageCover(buffer) : await typographicCover({ ...item, kategori });
  const coverStored = await storage.save({ buffer: gambar, mimetype: "image/jpeg", size: gambar.length, originalname: "sampul.jpg" }, "sampul");
  const isi = {};
  for (const k of WAJIB) if (!["pdfUrl", "kategori"].includes(k)) isi[k] = item[k];
  let book;
  try {
    book = await Book.create({
      ...isi,
      bahasa: item.bahasa || "Indonesia",
      kategori,
      halaman,
      asalPdf: item.pdfUrl,
      file: stored,
      cover: coverStored.url,
      coverStored,
      uploadedBy: admin._id,
      status: "disetujui",
      reviewedBy: admin._id,
      reviewedAt: new Date(),
    });
  } catch (error) {
    await storage.remove(coverStored); // jangan tinggalkan sampul yatim
    throw error;
  }
  await indexTextNow(book._id, buffer); // teks untuk LUMA
}

async function run(opts = {}, log = console.log) {
  const { file, jeda = JEDA } = opts;
  const daftar = muat(file);
  const out = { siap: 0, ditambahkan: 0, dilewati: 0, gagal: 0 };
  let admin; // uji coba tidak menyentuh database
  if (opts.simpan) {
    admin = await User.findOne({ role: "admin" }).sort({ createdAt: 1 });
    if (!admin) throw new Error("Belum ada akun admin. Jalankan server sekali dengan ADMIN_EMAIL & ADMIN_PASSWORD di .env.");
    if (!storage.usingCloudinary) log("Catatan: CLOUDINARY_URL kosong, sampul disimpan di disk lokal.");
  }
  let terakhir = 0;
  for (const [i, { item, salah }] of daftar.entries()) {
    const no = `[${i + 1}/${daftar.length}]`;
    try {
      if (item.lewati) {
        out.dilewati++;
        log(`${no} LEWATI ${item.judul}: ditandai "lewati"`);
        continue;
      }
      if (salah.length) throw new Error(salah.join("; "));
      if (opts.simpan && (await sudahAda(item))) {
        out.dilewati++;
        log(`${no} LEWATI ${item.judul}: sudah ada`);
        continue;
      }
      if (opts.simpan || opts.cekTautan) {
        await sleep(Math.max(0, terakhir + jeda - Date.now()));
        try {
          if (opts.simpan) await simpan(item, admin);
          else await importer.downloadPdf(item.pdfUrl, { maxMb: 150 });
        } finally {
          terakhir = Date.now();
        }
      }
      out.siap++;
      if (opts.simpan) out.ditambahkan++;
      log(`${no} ${opts.simpan ? "TERSIMPAN" : "SIAP"} ${item.judul} | ${item.penerbit} | ${item.lisensi} | ${item.kategori}\n      ${item.sumberUrl}`);
    } catch (error) {
      out.gagal++;
      log(`${no} GAGAL ${item.judul}: ${error.message}`);
    }
  }
  log(
    opts.simpan
      ? `Selesai: ${out.ditambahkan} ditambahkan, ${out.dilewati} dilewati, ${out.gagal} gagal.`
      : `Uji coba: ${out.siap} siap, ${out.dilewati} dilewati, ${out.gagal} gagal. Tidak ada yang disimpan; pakai --simpan untuk menulis.`,
  );
  return out;
}

if (require.main === module) {
  const opts = args(process.argv.slice(2));
  (async () => {
    if (opts.simpan) await connect(config.mongoUrl);
    const out = await run(opts);
    await mongoose.disconnect().catch(() => {});
    if (out.gagal) process.exitCode = 1;
  })().catch(async (e) => {
    console.error("Impor gagal:", e.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
}

module.exports = { run, args, periksa, muat };
