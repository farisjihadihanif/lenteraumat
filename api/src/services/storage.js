// Penyimpanan file buku & gambar.
// - Lokal (default): disimpan di folder uploads/ dan disajikan di /uploads/...
//   Cocok untuk VPS dengan disk permanen.
// - Cloudinary: isi CLOUDINARY_URL di .env (cocok untuk hosting tanpa disk
//   permanen seperti Render/Railway/Vercel).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const config = require("../config");
const { HttpError } = require("../middleware/errors");

let cloudinary = null;
if (config.cloudinaryUrl) {
  cloudinary = require("cloudinary").v2;
  cloudinary.config({ cloudinary_url: config.cloudinaryUrl, secure: true });
}

// Paket gratis Cloudinary membatasi file "raw" (PDF) 10 MB.
const CLOUDINARY_MAX = (Number(process.env.CLOUDINARY_MAX_MB) || 10) * 1024 * 1024;
const maxBytes = () => (cloudinary ? CLOUDINARY_MAX : Infinity);

const EXT = { "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };

async function save(file, folder) {
  if (file.size > maxBytes()) {
    throw new HttpError(400, `Ukuran file melebihi batas penyimpanan Cloudinary (${Math.round(CLOUDINARY_MAX / 1048576)} MB). Kecilkan PDF-nya dulu (mis. di ilovepdf.com/compress_pdf).`);
  }
  const ext = EXT[file.mimetype] || "";
  const name = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;

  if (cloudinary) {
    const result = await new Promise((resolve, reject) => {
      const fail = (err) => {
        console.error("Cloudinary:", err?.message || err);
        const msg = String(err?.message || "");
        if (/Invalid Signature|api_secret|Invalid api_key|Unknown API key|cloud_name/i.test(msg)) {
          return reject(new HttpError(500, "Penyimpanan Cloudinary salah atur: cek CLOUDINARY_URL di .env (API secret harus yang asli, bukan *****)."));
        }
        if (/File size too large/i.test(msg)) return reject(new HttpError(400, "File terlalu besar untuk paket Cloudinary-mu."));
        reject(new HttpError(502, "Gagal menyimpan file ke Cloudinary. Coba lagi."));
      };
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `lentera-umat/${folder}`,
          public_id: name.replace(ext, ""),
          resource_type: file.mimetype === "application/pdf" ? "raw" : "image",
          ...(file.mimetype === "application/pdf" ? { format: "pdf" } : {}),
        },
        (err, res) => (err ? fail(err) : resolve(res)),
      );
      stream.on("error", fail);
      stream.end(file.buffer);
    });
    return { url: result.secure_url, storage: "cloudinary", key: result.public_id, size: file.size };
  }

  const dir = path.join(config.uploadDir, folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), file.buffer);
  return { url: `${config.publicApiUrl}/uploads/${folder}/${name}`, storage: "local", key: `${folder}/${name}`, size: file.size };
}

async function remove(stored) {
  if (!stored?.key) return;
  try {
    if (stored.storage === "cloudinary" && cloudinary) {
      await cloudinary.uploader.destroy(stored.key, { resource_type: stored.url?.endsWith(".pdf") ? "raw" : "image" });
    } else if (stored.storage === "local") {
      const file = path.join(config.uploadDir, stored.key);
      if (file.startsWith(path.resolve(config.uploadDir))) fs.rmSync(file, { force: true });
    }
  } catch (error) {
    console.warn("Gagal menghapus file:", error.message);
  }
}

// Isi file sebagai Buffer (untuk ekstraksi teks & disajikan ke pembaca).
// maxMb: tolak file yang terlalu besar sebelum diunduh ke memori.
async function read(stored, { maxMb = 0 } = {}) {
  const tooBig = () => new HttpError(413, `File buku lebih dari ${maxMb} MB, terlalu besar untuk dibaca LUMA.`);
  if (stored.storage === "local") {
    const file = path.join(config.uploadDir, stored.key);
    if (maxMb && (await fs.promises.stat(file)).size > maxMb * 1024 * 1024) throw tooBig();
    return fs.promises.readFile(file);
  }
  if (maxMb && stored.size > maxMb * 1024 * 1024) throw tooBig();
  const res = await fetch(stored.url, { signal: AbortSignal.timeout(5 * 60 * 1000), headers: { "User-Agent": "LenteraUmat/2.0" } });
  if (maxMb && Number(res.headers.get("content-length")) > maxMb * 1024 * 1024) {
    res.body?.cancel().catch(() => {});
    throw tooBig();
  }
  if (res.status === 401 && stored.storage === "cloudinary") {
    throw new HttpError(502, "Cloudinary memblokir pengiriman PDF. Di Cloudinary buka Settings > Security, centang 'Allow delivery of PDF and ZIP files', lalu simpan.");
  }
  if (!res.ok) throw new HttpError(502, `Gagal mengambil file buku dari penyimpanan (${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

// Buka file dari penyimpanan luar sebagai stream (untuk dikirim ke pembaca).
// range: header Range dari browser diteruskan, supaya pdf.js cukup mengambil bagian yang dibaca.
// Alamat akhir setelah pengalihan (mis. archive.org/download -> server cermin) disimpan
// sebentar, supaya tiap potongan halaman tidak perlu melewati pengalihan lagi.
const finalUrls = new Map();
const FINAL_TTL = 30 * 60 * 1000;

async function open(stored, { range = "", signal } = {}) {
  const sig = signal ? AbortSignal.any([signal, AbortSignal.timeout(10 * 60 * 1000)]) : AbortSignal.timeout(10 * 60 * 1000);
  const headers = { "User-Agent": "LenteraUmat/2.0", ...(range ? { Range: range } : {}) };
  const cached = finalUrls.get(stored.url);
  let res;
  if (cached && cached.until > Date.now()) {
    res = await fetch(cached.url, { signal: sig, headers }).catch(() => null);
    if (!res || !res.ok) {
      finalUrls.delete(stored.url);
      res = null;
    }
  }
  if (!res) {
    res = await fetch(stored.url, { signal: sig, headers });
    if (res.ok && res.url && res.url !== stored.url) finalUrls.set(stored.url, { url: res.url, until: Date.now() + FINAL_TTL });
  }
  if (res.status === 401 && stored.storage === "cloudinary") {
    throw new HttpError(502, "Cloudinary memblokir pengiriman PDF. Di Cloudinary buka Settings > Security, centang 'Allow delivery of PDF and ZIP files', lalu simpan.");
  }
  if (!res.ok) throw new HttpError(502, `Gagal mengambil file buku dari penyimpanan (${res.status}).`);
  return res;
}

function localPath(stored) {
  return stored.storage === "local" ? path.join(config.uploadDir, stored.key) : null;
}

module.exports = { save, remove, read, open, localPath, maxBytes, usingCloudinary: Boolean(cloudinary) };
