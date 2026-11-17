const { Schema, model } = require("mongoose");

// Diskusi (pengganti fitur Artikel): tulisan/pertanyaan yang bisa dikaitkan
// dengan buku tertentu, lalu dibalas oleh pembaca lain.
const DiscussionSchema = new Schema(
  {
    judul: { type: String, required: true, trim: true, maxlength: 200 },
    isi: { type: String, required: true, maxlength: 20000 },
    cover: { type: String, default: "" },
    book: { type: Schema.Types.ObjectId, ref: "Book", index: true },
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
    balasanCount: { type: Number, default: 0 },
    lastActivityAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

DiscussionSchema.index({ judul: "text", isi: "text" });

module.exports = model("Discussion", DiscussionSchema);
