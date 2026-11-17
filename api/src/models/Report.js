const { Schema, model } = require("mongoose");

// Laporan konten bermasalah dari pengguna, ditinjau admin.
const ReportSchema = new Schema(
  {
    targetType: { type: String, enum: ["book", "discussion", "comment", "review"], required: true },
    target: { type: Schema.Types.ObjectId, required: true },
    reporter: { type: Schema.Types.ObjectId, ref: "User", required: true },
    alasan: { type: String, enum: ["spam", "tidak_pantas", "hak_cipta", "salah_informasi", "lainnya"], required: true },
    catatan: { type: String, default: "", maxlength: 1000 },
    status: { type: String, enum: ["baru", "selesai", "diabaikan"], default: "baru", index: true },
    handledBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
ReportSchema.index({ targetType: 1, target: 1, reporter: 1 });

module.exports = model("Report", ReportSchema);
