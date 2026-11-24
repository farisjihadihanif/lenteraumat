// Memeriksa sambungan Cloudinary dengan pengaturan yang dipakai aplikasi.
//
//   npm run cek:cloudinary
//
// Tidak menampilkan rahasia: hanya nama variabel, cloud name, dan 4 digit akhir API key.
const fs = require("fs");
const path = require("path");

const VARIABEL = ["CLOUDINARY_URL", "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "CLOUDINARY_ACCOUNT_URL", "CLOUDINARY_API_PROXY", "CLOUDINARY_MAX_MB"];
const isi = (n) => Boolean(process.env[n]);
// dotenv tidak menimpa variabel yang sudah ada di terminal/sistem, jadi asalnya dicatat sebelum .env dimuat.
const dariSistem = VARIABEL.filter((n) => process.env[n] !== undefined);

function gandaDiEnv() {
  try {
    const baris = fs.readFileSync(path.resolve(".env"), "utf8").match(/^\s*(?:export\s+)?CLOUDINARY_[A-Z_]+(?=\s*=)/gm) || [];
    const nama = baris.map((b) => b.trim().replace(/^export\s+/, ""));
    return [...new Set(nama.filter((n, i) => nama.indexOf(n) !== i))];
  } catch {
    return [];
  }
}

// Masalah bentuk nilai yang sering terjadi saat menyalin; nilainya sendiri tidak ditampilkan.
function masalahBentuk({ url = "", cloud_name = "", api_key = "", api_secret = "" }) {
  const out = [];
  if (/[<>]/.test(url)) out.push("masih ada tanda < atau >");
  if (/\s/.test(url)) out.push("ada spasi di dalam nilai");
  if (/["'`]/.test(url)) out.push("ada tanda kutip di dalam nilai");
  if (!cloud_name) out.push("cloud name kosong");
  if (!api_key) out.push("API key kosong");
  else if (!/^\d+$/.test(api_key)) out.push("API key bukan angka semua");
  if (!api_secret) out.push("API secret kosong");
  else if (/\*|your_|secret/i.test(api_secret)) out.push("API secret masih contoh / bintang");
  return out;
}

async function run({ cloudinary, log = console.log } = {}) {
  let cfg;
  let url;
  try {
    const config = require("../src/config"); // memuat .env seperti aplikasi
    url = config.cloudinaryUrl;
    log("Variabel:");
    for (const n of VARIABEL) log(`  ${n}: ${isi(n) ? `diisi (${dariSistem.includes(n) ? "dari terminal/sistem, mengalahkan .env" : "dari .env"})` : "kosong"}`);
    const ganda = gandaDiEnv();
    if (ganda.length) log(`  PERHATIAN: tertulis lebih dari sekali di .env: ${ganda.join(", ")} (baris terakhir yang dipakai)`);
    const terpisah = VARIABEL.slice(1, 4).filter(isi);
    if (terpisah.length) log(`  ${terpisah.join(", ")} tidak dipakai aplikasi; hanya CLOUDINARY_URL yang dibaca.`);
    if (!url) {
      log("\nCLOUDINARY_URL kosong: aplikasi memakai disk lokal, tidak ada yang diuji.");
      return { ok: false };
    }
    cloudinary = cloudinary || require("cloudinary").v2;
    cfg = cloudinary.config({ cloudinary_url: url, secure: true });
  } catch (e) {
    // Error dari URL yang rusak bisa membawa nilai aslinya, jadi hanya kodenya yang ditampilkan.
    log(`\nCLOUDINARY_URL tidak bisa dibaca (${e.code || e.name}). Bentuk yang benar: cloudinary://API_KEY:API_SECRET@CLOUD_NAME`);
    return { ok: false };
  }
  const { sensor, pesan, kode } = require("../src/services/cloudinaryError");
  log(`\nCLOUDINARY_URL dipakai (mengalahkan variabel terpisah).`);
  log(`Cloud name : ${sensor(cfg.cloud_name, cfg) || "(kosong)"}`);
  log(`API key    : ${cfg.api_key ? `...${String(cfg.api_key).slice(-4)}` : "(kosong)"}`);
  for (const m of masalahBentuk({ url, ...cfg })) log(`Bentuk     : ${m}`);

  log("\ncloudinary.api.ping():");
  try {
    const r = await cloudinary.api.ping();
    log(`  BERHASIL: ${r.status}`);
    return { ok: true };
  } catch (e) {
    log(`  GAGAL: http_code ${kode(e) || "-"}`);
    log(`  Pesan: ${pesan(e, cfg)}`);
    return { ok: false };
  }
}

if (require.main === module) {
  run().then((r) => {
    process.exitCode = r.ok ? 0 : 1;
  });
}

module.exports = { run, masalahBentuk };
