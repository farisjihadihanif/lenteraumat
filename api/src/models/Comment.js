const { Schema, model } = require("mongoose");

const CommentSchema = new Schema(
  {
    discussion: { type: Schema.Types.ObjectId, ref: "Discussion", required: true, index: true },
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
    isi: { type: String, required: true, trim: true, maxlength: 5000 },
  },
  { timestamps: true },
);

module.exports = model("Comment", CommentSchema);
