const { Schema, model } = require("mongoose");

// Kategori buku, dikelola admin dari dasbor.
const CategorySchema = new Schema(
  {
    nama: { type: String, required: true, unique: true, trim: true, maxlength: 60 },
    urutan: { type: Number, default: 100 },
  },
  { timestamps: true },
);

module.exports = model("Category", CategorySchema);
