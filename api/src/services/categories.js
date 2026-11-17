const Category = require("../models/Category");
const { HttpError } = require("../middleware/errors");

const DEFAULTS = [
  "Al-Qur'an & Tafsir",
  "Hadis",
  "Fikih",
  "Akidah & Akhlak",
  "Sejarah Islam",
  "Sejarah",
  "Pendidikan",
  "Sains & Teknologi",
  "Bahasa",
  "Sastra",
  "Seni & Budaya",
  "Biografi",
  "Pengembangan Diri",
  "Anak",
  "Umum",
];
const FALLBACK = "Umum";

// Dicek tiap kali (murah): kalau koleksi kategori kosong, isi kategori bawaan.
async function ensureDefaults() {
  if ((await Category.estimatedDocumentCount()) === 0) {
    await Category.insertMany(DEFAULTS.map((nama, i) => ({ nama, urutan: i })), { ordered: false }).catch(() => {});
  }
}

async function list() {
  await ensureDefaults();
  return Category.find().sort({ urutan: 1, nama: 1 });
}

// Pastikan nama kategori ada; kosong -> "Umum".
async function resolve(nama, { create = false } = {}) {
  await ensureDefaults();
  const n = String(nama || "").trim().slice(0, 60) || FALLBACK;
  const found = await Category.findOne({ nama: new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
  if (found) return found.nama;
  if (create) return (await Category.create({ nama: n })).nama;
  throw new HttpError(400, "Kategori tidak dikenal.");
}

module.exports = { list, resolve, ensureDefaults, DEFAULTS, FALLBACK };
