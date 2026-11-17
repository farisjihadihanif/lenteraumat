const { Schema, model } = require("mongoose");

// Halaman terakhir yang dibaca, untuk fitur "Lanjut membaca".
const ReadingProgressSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    book: { type: Schema.Types.ObjectId, ref: "Book", required: true },
    page: { type: Number, default: 1, min: 1 },
    totalPages: { type: Number, default: 0 },
  },
  { timestamps: true },
);

ReadingProgressSchema.index({ user: 1, book: 1 }, { unique: true });

module.exports = model("ReadingProgress", ReadingProgressSchema);
