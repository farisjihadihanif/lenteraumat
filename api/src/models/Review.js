const { Schema, model } = require("mongoose");

// Ulasan pembaca: satu user satu ulasan per buku (bisa diubah).
const ReviewSchema = new Schema(
  {
    book: { type: Schema.Types.ObjectId, ref: "Book", required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    komentar: { type: String, default: "", trim: true, maxlength: 2000 },
  },
  { timestamps: true },
);

ReviewSchema.index({ book: 1, user: 1 }, { unique: true });

module.exports = model("Review", ReviewSchema);
