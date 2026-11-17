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
    likes: [{ type: Schema.Types.ObjectId, ref: "User" }],
    likeCount: { type: Number, default: 0 },
    reposts: [{ type: Schema.Types.ObjectId, ref: "User" }],
    repostCount: { type: Number, default: 0 },
    lastRepostBy: { type: Schema.Types.ObjectId, ref: "User" },
    // Skor "Hot Topic": balasan & repost lebih berbobot daripada suka.
    skor: { type: Number, default: 0, index: true },
    lastActivityAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

DiscussionSchema.index({ judul: "text", isi: "text" });

module.exports = model("Discussion", DiscussionSchema);
