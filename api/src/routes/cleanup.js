// Hapus data terkait saat buku / akun dihapus.
const Book = require("../models/Book");
const BookText = require("../models/BookText");
const Review = require("../models/Review");
const ReadingProgress = require("../models/ReadingProgress");
const Discussion = require("../models/Discussion");
const Comment = require("../models/Comment");
const ChatSession = require("../models/ChatSession");
const storage = require("../services/storage");

async function recomputeRating(bookId) {
  const [agg] = await Review.aggregate([
    { $match: { book: bookId } },
    { $group: { _id: null, avg: { $avg: "$rating" }, n: { $sum: 1 } } },
  ]);
  await Book.updateOne(
    { _id: bookId },
    { ratingAvg: agg ? Math.round(agg.avg * 10) / 10 : 0, ratingCount: agg ? agg.n : 0 },
  );
}

async function deleteBook(book) {
  await Promise.all([
    storage.remove(book.file),
    book.coverStored ? storage.remove(book.coverStored) : null,
    BookText.deleteMany({ book: book._id }),
    Review.deleteMany({ book: book._id }),
    ReadingProgress.deleteMany({ book: book._id }),
    Discussion.updateMany({ book: book._id }, { $unset: { book: 1 } }),
  ]);
  await book.deleteOne();
}

async function deleteUserContent(userId) {
  const books = await Book.find({ uploadedBy: userId });
  for (const b of books) await deleteBook(b);
  const reviewed = await Review.find({ user: userId }).distinct("book");
  await Review.deleteMany({ user: userId });
  for (const id of reviewed) await recomputeRating(id);
  const discussions = await Discussion.find({ author: userId }).distinct("_id");
  await Comment.deleteMany({ $or: [{ author: userId }, { discussion: { $in: discussions } }] });
  await Discussion.deleteMany({ author: userId });
  await ChatSession.deleteMany({ user: userId });
  await ReadingProgress.deleteMany({ user: userId });
  await Book.updateMany({ disimpan: userId }, { $pull: { disimpan: userId } });
}

module.exports = { recomputeRating, deleteBook, deleteUserContent };
