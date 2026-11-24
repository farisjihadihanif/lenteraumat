// Tanda tangan unggah langsung ke Cloudinary (PDF buku & sampul).
const express = require("express");
const rateLimit = require("express-rate-limit");
const { requireAuth } = require("../middleware/auth");
const storage = require("../services/storage");
const directUpload = require("../services/directUpload");

const router = express.Router();
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 60,
  keyGenerator: (req) => String(req.user._id),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Terlalu banyak unggahan. Coba lagi beberapa menit lagi." },
});

router.post("/sign", requireAuth, limiter, (req, res) => {
  // Tanpa Cloudinary (laptop): browser mengirim file lewat API seperti biasa.
  if (!storage.usingCloudinary) return res.json({ direct: false });
  res.json({ direct: true, ...directUpload.sign(req.user._id, req.body || {}) });
});

module.exports = router;
