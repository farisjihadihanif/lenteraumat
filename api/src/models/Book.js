const { Schema, model } = require("mongoose");

// Alur status: user mengunggah -> "menunggu" -> admin "disetujui" / "ditolak" /
// "revisi" (minta diperbaiki). Buku yang diunggah admin langsung "disetujui".
const STATUSES = ["menunggu", "disetujui", "ditolak", "revisi"];

const BookSchema = new Schema(
  {
    judul: { type: String, required: true, trim: true, maxlength: 200 },
    penulis: { type: String, required: true, trim: true, maxlength: 150 },
    penerbit: { type: String, default: "", trim: true, maxlength: 150 },
    tahunTerbit: { type: Number, min: 0, max: 3000 },
    isbn: { type: String, default: "", trim: true, maxlength: 30 },
    edisi: { type: String, default: "", trim: true, maxlength: 50 },
    bahasa: { type: String, default: "Indonesia", trim: true, maxlength: 40 },
    kategori: { type: String, default: "Umum", trim: true, maxlength: 60, index: true },
    // Asal buku (untuk buku dari perpustakaan/arsip terbuka) & lisensinya.
    sumber: { type: String, default: "", trim: true, maxlength: 150 },
    sumberUrl: { type: String, default: "", trim: true, maxlength: 500 },
    lisensi: { type: String, default: "", trim: true, maxlength: 150 },
    lisensiUrl: { type: String, default: "", trim: true, maxlength: 300 },
    // Baris sitasi siap salin (penulis, tahun, judul, jurnal, DOI).
    sitasi: { type: String, default: "", trim: true, maxlength: 1500 },
    // Tautan PDF asal kalau buku diimpor (untuk mencegah impor ganda).
    asalPdf: { type: String, default: "", index: true },
    deskripsi: { type: String, default: "", maxlength: 3000 },
    cover: { type: String, default: "" },
    coverStored: { url: String, storage: String, key: String },
    file: {
      url: { type: String, required: true },
      storage: { type: String, enum: ["local", "cloudinary", "external"], default: "local" },
      key: { type: String, default: "" },
      size: { type: Number, default: 0 },
    },
    halaman: { type: Number, default: 0 },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: STATUSES, default: "menunggu", index: true },
    catatanReview: { type: String, default: "", maxlength: 1000 },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    dibaca: { type: Number, default: 0 },
    disimpan: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true },
);

BookSchema.index({ judul: "text", penulis: "text", deskripsi: "text" });

BookSchema.statics.STATUSES = STATUSES;

module.exports = model("Book", BookSchema);
