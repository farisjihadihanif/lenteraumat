// Perkecil gambar di browser sebelum diunggah (Vercel menolak body di atas 4,5 MB).
export const MAX_UPLOAD_MB = 4;
const MAX_SIDE = 1600;
const QUALITY = 0.85;

const toBlob = (canvas, type) => new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));

function draw(img, background) {
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (!img.naturalWidth) return file;
    let blob = null;
    if (file.type !== "image/jpeg") blob = await toBlob(draw(img), "image/webp");
    // Safari belum bisa menulis WebP (hasilnya PNG): pakai JPEG berlatar putih.
    if (blob?.type !== "image/webp") blob = await toBlob(draw(img, "#fff"), "image/jpeg");
    const resized = Math.max(img.naturalWidth, img.naturalHeight) > MAX_SIDE;
    if (!blob || (!resized && blob.size >= file.size)) return file;
    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.${ext}`, { type: blob.type });
  } catch {
    return file; // format yang tidak bisa dibuka browser (mis. HEIC): kirim apa adanya
  } finally {
    URL.revokeObjectURL(url);
  }
}

// GIF tidak disentuh supaya animasinya tetap ada.
export async function compressImage(file) {
  const out = /^image\/(?!gif|svg)/.test(file.type) ? await shrink(file) : file;
  if (out.size > MAX_UPLOAD_MB * 1024 * 1024) throw new Error(`${file.name}: ukuran gambar masih lebih dari ${MAX_UPLOAD_MB} MB. Pilih gambar yang lebih kecil.`);
  return out;
}
