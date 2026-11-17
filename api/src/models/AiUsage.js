const { Schema, model } = require("mongoose");

// Jumlah permintaan LUMA per user per hari (WIB). Dokumen lama dihapus otomatis setelah 3 hari.
const AiUsageSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  day: { type: String, required: true },
  count: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, expires: 3 * 24 * 60 * 60 },
});
AiUsageSchema.index({ user: 1, day: 1 }, { unique: true });

module.exports = model("AiUsage", AiUsageSchema);
