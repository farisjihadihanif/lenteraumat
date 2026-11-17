const { Schema, model } = require("mongoose");

// Teks hasil ekstraksi PDF, disimpan terpisah supaya daftar buku tetap ringan.
// Dipakai LUMA untuk tanya-jawab, ringkasan, dan kuis.
const BookTextSchema = new Schema(
  {
    book: { type: Schema.Types.ObjectId, ref: "Book", unique: true, required: true },
    text: { type: String, default: "" },
    pages: { type: Number, default: 0 },
    error: { type: String, default: "" },
  },
  { timestamps: true },
);

module.exports = model("BookText", BookTextSchema);
