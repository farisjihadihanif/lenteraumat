// Penyimpanan PDF buku + ekstraksi teks untuk LUMA. Dipakai unggah, impor, dan skrip.
const BookText = require("../models/BookText");
const storage = require("./storage");
const { extractText, countPages } = require("./pdfText");
const { HttpError } = require("../middleware/errors");
const { isRealPdf } = require("../middleware/upload");

// sourceUrl: tautan PDF asal (impor). Kalau file terlalu besar untuk penyimpanan
// (mis. batas 10 MB Cloudinary gratis) atau link=true, buku cukup ditautkan ke sumber aslinya.
async function storePdf(buffer, name = "buku.pdf", { sourceUrl = "", link = false } = {}) {
  if (!isRealPdf(buffer)) throw new HttpError(400, "File bukan PDF yang valid.");
  let halaman = 0;
  try {
    halaman = await countPages(buffer);
  } catch {
    throw new HttpError(400, "PDF rusak atau terkunci password, tidak bisa dibuka.");
  }
  if (sourceUrl && (link || buffer.length > storage.maxBytes())) {
    return { stored: { url: sourceUrl, storage: "external", key: "", size: buffer.length }, halaman, linked: true };
  }
  const stored = await storage.save({ buffer, mimetype: "application/pdf", size: buffer.length, originalname: name }, "buku");
  return { stored, halaman, linked: false };
}

async function indexTextNow(bookId, buffer) {
  try {
    const { text, pages } = await extractText(buffer);
    await BookText.findOneAndUpdate({ book: bookId }, { text, pages, error: "" }, { upsert: true });
  } catch (error) {
    await BookText.findOneAndUpdate({ book: bookId }, { text: "", error: error.message }, { upsert: true }).catch(() => {});
  }
}

// Di belakang layar supaya respons unggah cepat.
function indexText(bookId, buffer) {
  setImmediate(() => indexTextNow(bookId, buffer));
}

module.exports = { storePdf, indexText, indexTextNow };
