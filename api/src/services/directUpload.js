// Unggah langsung browser -> Cloudinary. Vercel menolak body di atas 4,5 MB, jadi API hanya
// menandatangani, lalu memeriksa file yang sudah tersimpan sebelum URL-nya dicatat.
const crypto = require("crypto");
const config = require("../config");
const storage = require("./storage");
const { HttpError } = require("../middleware/errors");
const { isRealPdf } = require("../middleware/upload");

const MB = 1024 * 1024;
const KINDS = {
  buku: { resource: "raw", ext: ".pdf", max: () => Math.min(config.maxPdfMb * MB, storage.maxBytes()), types: ["application/pdf"], typeMsg: "File buku harus PDF." },
  sampul: { resource: "image", ext: "", max: () => 5 * MB, types: ["image/jpeg", "image/png", "image/webp", "image/gif"], typeMsg: "Gambar harus JPG, PNG, WEBP, atau GIF." },
};

// Isi asli file, bukan nama/tipe yang dikirim browser.
function isRealImage(b) {
  const hex = b.subarray(0, 4).toString("hex");
  const head = b.subarray(0, 4).toString("latin1");
  return hex.startsWith("ffd8ff") || hex === "89504e47" || head === "GIF8" || (head === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP");
}

const sizeMsg = (k) => `Ukuran ${k.resource === "raw" ? "PDF" : "gambar sampul"} maksimal ${Math.floor(k.max() / MB)} MB.`;

function sign(userId, { kind, type, size }) {
  const k = Object.hasOwn(KINDS, kind) ? KINDS[kind] : null;
  if (!k) throw new HttpError(400, "Jenis unggahan tidak dikenal.");
  if (!k.types.includes(type)) throw new HttpError(400, k.typeMsg);
  if (!(Number(size) > 0)) throw new HttpError(400, "File kosong.");
  if (Number(size) > k.max()) throw new HttpError(400, sizeMsg(k));
  const cfg = storage.cloudinary.config();
  // overwrite=false ikut ditandatangani: file yang sudah ditinjau admin tidak bisa ditimpa.
  const params = {
    overwrite: "false",
    public_id: `lenteraumat/${kind}/${userId}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${k.ext}`,
    timestamp: Math.floor(Date.now() / 1000),
    ...(k.resource === "image" ? { allowed_formats: "jpg,png,webp,gif" } : {}),
  };
  const signature = storage.cloudinary.utils.api_sign_request(params, cfg.api_secret);
  return { url: `https://api.cloudinary.com/v1_1/${cfg.cloud_name}/${k.resource}/upload`, fields: { ...params, api_key: cfg.api_key, signature } };
}

// Bukti dari jawaban Cloudinary: milik user ini dan tanda tangannya cocok. URL disusun server,
// tidak pernah diterima dari browser. Null kalau tidak ada unggahan.
function claim(userId, kind, raw) {
  if (!raw) return null;
  const k = KINDS[kind];
  const bad = () => new HttpError(400, "Data unggahan tidak valid. Ulangi unggah filenya.");
  if (!storage.usingCloudinary || typeof raw !== "object") throw bad();
  const key = String(raw.public_id || "");
  const version = String(raw.version || "");
  // Folder lama "lentera-umat" tetap diterima (unggahan yang ditandatangani sebelum ganti nama).
  const pattern = new RegExp(`^(?:lenteraumat|lentera-umat)/${kind}/${userId}-\\d+-[a-f0-9]{12}${k.ext.replace(".", "\\.")}$`);
  if (!pattern.test(key) || !/^\d+$/.test(version)) throw bad();
  if (!storage.cloudinary.utils.verify_api_response_signature(key, version, String(raw.signature || ""))) throw bad();
  return { kind, key, storage: "cloudinary", url: `https://res.cloudinary.com/${storage.cloudinary.config().cloud_name}/${k.resource}/upload/v${version}/${key}` };
}

// Ambil file yang sudah tersimpan, lalu cek ukuran & jenis aslinya.
async function check(claimed) {
  const k = KINDS[claimed.kind];
  const max = k.max();
  const gagal = () => new HttpError(502, "Gagal memeriksa file di Cloudinary. Coba lagi.");
  let res;
  try {
    res = await fetch(claimed.url, { signal: AbortSignal.timeout(60 * 1000), headers: { "User-Agent": "LenteraUmat/2.0" } });
  } catch {
    throw gagal();
  }
  if (res.status === 401) throw new HttpError(502, "Cloudinary memblokir pengiriman PDF. Di Cloudinary buka Settings > Security, centang 'Allow delivery of PDF and ZIP files', lalu simpan.");
  if (!res.ok) throw new HttpError(400, "File belum tersimpan di Cloudinary. Ulangi unggah filenya.");
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > max) throw new HttpError(400, sizeMsg(k));
      chunks.push(Buffer.from(chunk));
    }
  } catch (error) {
    throw error instanceof HttpError ? error : gagal();
  }
  const buffer = Buffer.concat(chunks);
  if (k.resource === "raw" && !isRealPdf(buffer)) throw new HttpError(400, "File bukan PDF yang valid.");
  if (k.resource === "image" && !isRealImage(buffer)) throw new HttpError(400, k.typeMsg);
  return { buffer, stored: { url: claimed.url, storage: "cloudinary", key: claimed.key, size } };
}

module.exports = { sign, claim, check };
