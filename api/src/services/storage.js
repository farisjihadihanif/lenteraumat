// Penyimpanan file buku & gambar.
// - Lokal (default): disimpan di folder uploads/ dan disajikan di /uploads/...
//   Cocok untuk VPS dengan disk permanen.
// - Cloudinary: isi CLOUDINARY_URL di .env (cocok untuk hosting tanpa disk
//   permanen seperti Render/Railway/Vercel).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const config = require("../config");

let cloudinary = null;
if (config.cloudinaryUrl) {
  cloudinary = require("cloudinary").v2;
  cloudinary.config({ cloudinary_url: config.cloudinaryUrl, secure: true });
}

const EXT = { "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };

async function save(file, folder) {
  const ext = EXT[file.mimetype] || "";
  const name = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;

  if (cloudinary) {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `lentera-umat/${folder}`,
          public_id: name.replace(ext, ""),
          resource_type: file.mimetype === "application/pdf" ? "raw" : "image",
          ...(file.mimetype === "application/pdf" ? { format: "pdf" } : {}),
        },
        (err, res) => (err ? reject(err) : resolve(res)),
      );
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
async function read(stored) {
  if (stored.storage === "local") {
    const file = path.join(config.uploadDir, stored.key);
    return fs.promises.readFile(file);
  }
  const res = await fetch(stored.url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`Gagal mengambil file (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

function localPath(stored) {
  return stored.storage === "local" ? path.join(config.uploadDir, stored.key) : null;
}

module.exports = { save, remove, read, localPath, usingCloudinary: Boolean(cloudinary) };
