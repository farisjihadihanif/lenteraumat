const express = require("express");
const Review = require("../models/Review");
const { requireAuth, isAdmin, isOwner } = require("../middleware/auth");
const { HttpError, isId } = require("../middleware/errors");
const { recomputeRating } = require("./cleanup");

const router = express.Router();

// Hapus ulasan: penulis ulasan sendiri, atau admin (moderasi).
router.delete("/:id", requireAuth, async (req, res) => {
  if (!isId(req.params.id)) throw new HttpError(404, "Ulasan tidak ditemukan.");
  const review = await Review.findById(req.params.id);
  if (!review) throw new HttpError(404, "Ulasan tidak ditemukan.");
  if (!isAdmin(req.user) && !isOwner(req.user, review.user)) throw new HttpError(403, "Kamu tidak bisa menghapus ulasan ini.");
  await review.deleteOne();
  await recomputeRating(review.book);
  res.json({ ok: true });
});

module.exports = router;
