const { Schema, model } = require("mongoose");

const CommentSchema = new Schema(
  {
    discussion: { type: Schema.Types.ObjectId, ref: "Discussion", required: true, index: true },
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
    isi: { type: String, required: true, trim: true, maxlength: 5000 },
    // Balasan untuk komentar lain. Satu tingkat: balasan dari balasan tetap menempel
    // ke komentar utamanya, dengan replyTo = orang yang dibalas.
    parent: { type: Schema.Types.ObjectId, ref: "Comment", default: null, index: true },
    replyTo: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

module.exports = model("Comment", CommentSchema);
