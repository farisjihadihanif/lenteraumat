// Penyimpanan PDF buku + ekstraksi teks untuk LUMA. Dipakai unggah, impor, dan skrip.
const BookText = require("../models/BookText");
const config = require("../config");
const storage = require("./storage");
const { extractText, countPages } = require("./pdfText");
const { HttpError } = require("../middleware/errors");
const { isRealPdf } = require("../middleware/upload");

async function pageCount(buffer) {
  if (!isRealPdf(buffer)) throw new HttpError(400, "File bukan PDF yang valid.");
  try {
    return await countPages(buffer);
  } catch {
    throw new HttpError(400, "PDF rusak atau terkunci password, tidak bisa dibuka.");
  }
}

// sourceUrl: tautan PDF asal (impor). Kalau file terlalu besar untuk penyimpanan
// (mis. batas 10 MB Cloudinary gratis) atau link=true, buku cukup ditautkan ke sumber aslinya.
async function storePdf(buffer, name = "buku.pdf", { sourceUrl = "", link = false } = {}) {
  const halaman = await pageCount(buffer);
  if (sourceUrl && (link || buffer.length > storage.maxBytes())) {
    return { stored: { url: sourceUrl, storage: "external", key: "", size: buffer.length }, halaman, linked: true };
  }
  const stored = await storage.save({ buffer, mimetype: "application/pdf", size: buffer.length, originalname: name }, "buku");
  return { stored, halaman, linked: false };
}

// Buku dari Internet Archive sudah punya teks OCR (_djvu.txt), jauh lebih ringan dari PDF-nya.
async function archiveText(file, timeoutMs) {
  const m = /^https:\/\/archive\.org\/download\/(.+)\.pdf$/i.exec(file?.url || "");
  if (!m) return null;
  try {
    const res = await fetch(`https://archive.org/download/${m[1]}_djvu.txt`, { signal: AbortSignal.timeout(timeoutMs), headers: { "User-Agent": "LenteraUmat/2.0" } });
    if (!res.ok) return null;
    const text = (await res.text()).slice(0, 400000);
    return text.trim().length > 50 ? { text, pages: 0 } : null;
  } catch {
    return null;
  }
}

async function indexTextNow(bookId, buffer) {
  try {
    const { text, pages } = await extractText(buffer);
    await BookText.findOneAndUpdate({ book: bookId }, { text, pages, error: "" }, { upsert: true });
  } catch (error) {
    await BookText.findOneAndUpdate({ book: bookId }, { text: "", error: error.message }, { upsert: true }).catch(() => {});
  }
}

// Di belakang layar supaya respons unggah cepat. Di Vercel fungsi dibekukan setelah membalas,
// jadi teksnya diekstrak nanti saat buku pertama kali dipakai di LUMA.
function indexText(bookId, buffer) {
  if (config.onVercel) return;
  setImmediate(() => indexTextNow(bookId, buffer));
}

module.exports = { storePdf, pageCount, indexText, indexTextNow, archiveText };
