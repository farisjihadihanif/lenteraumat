// Sampul buku dibuat di server (skrip impor katalog): dari halaman pertama PDF
// atau sampul tipografi sederhana dengan warna per kategori.
const path = require("path");

const W = 600;
const H = 900;
const CREAM = "#FFF1DE";
const GOLD = "#FFC93C";
const WARNA = {
  "Al-Qur'an & Tafsir": "#1F4D4E",
  Hadis: "#316B6C",
  Fikih: "#143752",
  "Akidah & Akhlak": "#5B3A5E",
  "Sejarah Islam": "#7A3E12",
  "Pendidikan Islam": "#2F5D3A",
  "Ekonomi Syariah": "#6B4F10",
  Sains: "#1B5E7A",
  Teknologi: "#33415C",
  Kesehatan: "#8A2F3B",
};
const warnaKategori = (k) => WARNA[k] || "#3E5A72";

// Pecah teks menjadi baris yang muat. Kata yang terlalu panjang dipotong per huruf.
function wrap(ctx, text, width) {
  const lines = [];
  let line = "";
  for (let word of String(text).split(/\s+/).filter(Boolean)) {
    if (line && ctx.measureText(`${line} ${word}`).width > width) {
      lines.push(line);
      line = "";
    }
    while (ctx.measureText(word).width > width && word.length > 1) {
      let n = word.length;
      while (n > 1 && ctx.measureText(word.slice(0, n)).width > width) n--;
      lines.push(word.slice(0, n));
      word = word.slice(n);
    }
    line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

async function typographicCover({ judul, penulis = "", kategori = "" }) {
  const { createCanvas } = require("@napi-rs/canvas"); // devDependency: hanya dimuat saat menggambar
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = warnaKategori(kategori);
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = GOLD;
  ctx.fillRect(60, 80, 160, 5);
  ctx.font = "600 26px Manrope, 'Segoe UI', Arial, sans-serif";
  ctx.fillText(kategori, 60, 132);
  // Huruf judul mengecil sampai muat di ruang yang ada.
  let size = 62;
  let lines;
  do {
    size -= 2;
    ctx.font = `600 ${size}px Literata, Georgia, 'DejaVu Serif', serif`;
    lines = wrap(ctx, judul, W - 120);
  } while (size > 26 && lines.length * size * 1.22 > 480);
  ctx.fillStyle = CREAM;
  lines.forEach((l, i) => ctx.fillText(l, 60, 230 + i * size * 1.22));
  ctx.font = "400 26px Manrope, 'Segoe UI', Arial, sans-serif";
  ctx.globalAlpha = 0.9;
  wrap(ctx, penulis, W - 120)
    .slice(0, 3)
    .forEach((l, i) => ctx.fillText(l, 60, 770 + i * 34));
  return canvas.encode("jpeg", 85);
}

async function firstPageCover(buffer) {
  const { createCanvas } = require("@napi-rs/canvas"); // devDependency: hanya dimuat saat menggambar
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const root = path.join(require.resolve("pdfjs-dist/package.json"), "..") + path.sep;
  const doc = await getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    disableFontFace: true,
    standardFontDataUrl: `${root}standard_fonts${path.sep}`,
    cMapUrl: `${root}cmaps${path.sep}`,
    cMapPacked: true,
    verbosity: 0,
  }).promise;
  try {
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: W / page.getViewport({ scale: 1 }).width });
    const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return await canvas.encode("jpeg", 85);
  } finally {
    await doc.destroy();
  }
}

module.exports = { typographicCover, firstPageCover, warnaKategori };
