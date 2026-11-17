const mongoose = require("mongoose");

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const isId = (v) => mongoose.isValidObjectId(v);

function notFound(req, res) {
  res.status(404).json({ message: "Alamat API tidak ditemukan." });
}

// Express 5 meneruskan error dari handler async ke sini.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) return res.status(err.status).json({ message: err.message });
  if (err?.name === "ValidationError") {
    const first = Object.values(err.errors)[0];
    return res.status(400).json({ message: first?.message || "Data tidak valid." });
  }
  if (err?.name === "CastError") return res.status(400).json({ message: "ID tidak valid." });
  if (err?.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    const label = { username: "Username", email: "Email" }[field] || "Data";
    return res.status(409).json({ message: `${label} sudah dipakai.` });
  }
  if (err?.name === "MulterError") {
    const msg = err.code === "LIMIT_FILE_SIZE" ? "Ukuran file terlalu besar." : "Upload file gagal.";
    return res.status(400).json({ message: msg });
  }
  if (err?.type === "entity.too.large") return res.status(413).json({ message: "Data terlalu besar." });
  console.error(err);
  res.status(500).json({ message: "Terjadi kesalahan di server." });
}

module.exports = { HttpError, isId, notFound, errorHandler };
