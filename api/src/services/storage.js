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
const { pesan, kode, agenCatat } = require("./cloudinaryError");

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
      const agent = agenCatat(cloudinary.config().upload_prefix);
      const fail = (err) => {
        const cfg = cloudinary.config();
        const msg = agent.detail ? pesan({ message: agent.detail }, cfg) : pesan(err, cfg);
        console.error(`Cloudinary (http_code ${kode(err) || "-"}): ${msg}`);
        if (/Invalid Signature|api_secret|Invalid api_key|Unknown API key|cloud_name/i.test(msg)) {
          return reject(new HttpError(500, "Penyimpanan Cloudinary salah atur: cek CLOUDINARY_URL di .env (API secret harus yang asli, bukan *****)."));
        }
        if (/File size too large/i.test(msg)) return reject(new HttpError(400, "File terlalu besar untuk paket Cloudinary-mu."));
        reject(new HttpError(502, "Gagal menyimpan file ke Cloudinary. Coba lagi."));
      };
      const stream = cloudinary.uploader.upload_stream(
        {
          agent,
          folder: `lenteraumat/${folder}`,
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

  if (config.onVercel) throw new HttpError(500, "CLOUDINARY_URL wajib diisi di Vercel (tidak ada disk permanen).");
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
    // Cloudinary kadang menolak dengan objek { error: { message } }, bukan Error.
    console.warn("Gagal menghapus file:", stored.storage === "cloudinary" && cloudinary ? pesan(error, cloudinary.config()) : error?.message || stored.key);
  }
}

// Isi file sebagai Buffer (untuk ekstraksi teks & disajikan ke pembaca).
// maxMb: tolak file yang terlalu besar sebelum diunduh ke memori.
async function read(stored, { maxMb = 0, timeoutMs = 5 * 60 * 1000 } = {}) {
  const tooBig = () => new HttpError(413, `File buku lebih dari ${maxMb} MB, terlalu besar untuk dibaca LUMA.`);
  if (stored.storage === "local") {
    const file = path.join(config.uploadDir, stored.key);
    if (maxMb && (await fs.promises.stat(file)).size > maxMb * 1024 * 1024) throw tooBig();
    return fs.promises.readFile(file);
  }
  if (maxMb && stored.size > maxMb * 1024 * 1024) throw tooBig();
  const res = await fetch(stored.url, { signal: AbortSignal.timeout(timeoutMs), headers: { "User-Agent": "LenteraUmat/2.0" } });
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

// Server archive.org kadang tidak menjawab; jangan menunggu satu server terlalu lama.
const HEAD_TIMEOUT = 9 * 1000;
const PUTUS = "Sumber buku sedang tidak bisa dihubungi. Coba lagi sebentar.";

// fetch yang menyerah kalau header tidak datang dalam `ms`; isi respons tidak ikut dibatasi.
async function fetchHead(url, { headers, signal, ms }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error("Sumber tidak menjawab.")), ms);
  try {
    return await fetch(url, { headers, signal: AbortSignal.any([signal, ctrl.signal]) });
  } finally {
    clearTimeout(timer);
  }
}

// Server iaXXXX / dnXXXX lain yang menyimpan file archive.org yang sama.
async function archiveMirrors(url, signal) {
  const m = /^https?:\/\/archive\.org\/download\/([^/]+)\/(.+)$/.exec(url);
  if (!m) return [];
  try {
    const res = await fetch(`https://archive.org/metadata/${m[1]}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(HEAD_TIMEOUT)]), headers: { "User-Agent": "LenteraUmat/2.0" } });
    const meta = await res.json();
    const hosts = [...new Set([...(meta.workable_servers || []), meta.d1, meta.d2])].filter((h) => /^[a-z0-9.-]+\.archive\.org$/i.test(h || ""));
    return meta.dir ? hosts.slice(0, 3).map((h) => `https://${h}${meta.dir}/${m[2]}`) : [];
  } catch {
    return [];
  }
}

async function open(stored, { range = "", signal } = {}) {
  const sig = signal ? AbortSignal.any([signal, AbortSignal.timeout(10 * 60 * 1000)]) : AbortSignal.timeout(10 * 60 * 1000);
  // identity: tanpa kompresi, supaya content-length dari sumber cocok dengan isi yang diteruskan.
  const headers = { "User-Agent": "LenteraUmat/2.0", "Accept-Encoding": "identity", ...(range ? { Range: range } : {}) };
  const isArchive = /^https?:\/\/archive\.org\//.test(stored.url);
  const usable = (r) => Boolean(r && (r.ok || (range && r.status === 416)));
  let lastError = null;
  // null = server tidak menjawab atau sedang galat; layak dicoba di server lain.
  const attempt = async (url, ms) => {
    const r = await fetchHead(url, { headers, signal: sig, ms }).catch((e) => {
      lastError = e;
      return null;
    });
    if (sig.aborted) throw sig.reason;
    if (r && r.status >= 500) {
      r.body?.cancel().catch(() => {});
      lastError = new Error(`status ${r.status}`);
      return null;
    }
    return r;
  };
  // Hanya dipakai bila hasilnya benar-benar file.
  const attemptUsable = async (url) => {
    const r = await attempt(url, HEAD_TIMEOUT);
    if (usable(r)) return r;
    r?.body?.cancel().catch(() => {});
    return null;
  };
  let res = null;
  const cached = finalUrls.get(stored.url);
  if (cached && cached.until > Date.now()) {
    res = await attemptUsable(cached.url);
    if (!res) finalUrls.delete(stored.url);
  }
  if (!res) res = await attempt(stored.url, isArchive ? HEAD_TIMEOUT : 30 * 1000);
  if (!res && isArchive) {
    for (const url of await archiveMirrors(stored.url, sig)) {
      res = await attemptUsable(url);
      if (res) break;
    }
  }
  if (!res) {
    console.error("Sumber buku gagal:", stored.url, lastError?.cause?.code || lastError?.message);
    throw new HttpError(502, PUTUS);
  }
  if (res.ok && res.url && res.url !== stored.url) finalUrls.set(stored.url, { url: res.url, until: Date.now() + FINAL_TTL });
  if (res.status === 401 && stored.storage === "cloudinary") {
    throw new HttpError(502, "Cloudinary memblokir pengiriman PDF. Di Cloudinary buka Settings > Security, centang 'Allow delivery of PDF and ZIP files', lalu simpan.");
  }
  if (!usable(res)) {
    res.body?.cancel().catch(() => {});
    throw new HttpError(502, `Gagal mengambil file buku dari penyimpanan (${res.status}).`);
  }
  return res;
}

// Alamat yang boleh diambil langsung oleh browser (mendukung CORS + Range). archive.org/download dan
// situs OJS tidak mengirim header CORS, jadi tetap lewat proxy.
function directUrl(stored) {
  return /^https:\/\/res\.cloudinary\.com\//.test(stored?.url || "") ? stored.url : "";
}

function localPath(stored) {
  return stored.storage === "local" ? path.join(config.uploadDir, stored.key) : null;
}

module.exports = { save, remove, read, open, directUrl, PUTUS, localPath, maxBytes, usingCloudinary: Boolean(cloudinary), cloudinary };
