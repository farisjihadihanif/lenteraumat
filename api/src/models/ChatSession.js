const { Schema, model } = require("mongoose");

const MessageSchema = new Schema(
  {
    role: { type: String, enum: ["user", "model"], required: true },
    content: { type: String, required: true },
    // Jenis pesan untuk tampilan: chat biasa, tanya buku, ringkasan, kuis.
    kind: { type: String, enum: ["chat", "ask", "summary", "quiz"], default: "chat" },
    data: Schema.Types.Mixed,
    // Lampiran (disimpan di Gemini Files API selama 48 jam; kita simpan rujukannya saja)
    lampiran: [
      {
        _id: false,
        name: String,
        mimeType: String,
        size: Number,
        uri: String,
        expiresAt: Date,
      },
    ],
  },
  { timestamps: true },
);

const ChatSessionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, default: "Percakapan baru", maxlength: 120 },
    book: { type: Schema.Types.ObjectId, ref: "Book" },
    messages: [MessageSchema],
  },
  { timestamps: true },
);

module.exports = model("ChatSession", ChatSessionSchema);
