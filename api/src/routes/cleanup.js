// Hapus data terkait saat buku / akun dihapus.
const Report = require("../models/Report");
const AiUsage = require("../models/AiUsage");
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
  const own = await Comment.find({ author: userId }).distinct("_id");
  // balasan orang lain untuk komentar user ini ikut terhapus; hitung ulang jumlah balasan
  const touched = await Comment.find({ $or: [{ _id: { $in: own } }, { parent: { $in: own } }] }).distinct("discussion");
  await Comment.deleteMany({ $or: [{ _id: { $in: own } }, { parent: { $in: own } }, { discussion: { $in: discussions } }] });
  for (const id of touched) await Discussion.updateOne({ _id: id }, { balasanCount: await Comment.countDocuments({ discussion: id }) });
  await Discussion.deleteMany({ author: userId });
  await ChatSession.deleteMany({ user: userId });
  await ReadingProgress.deleteMany({ user: userId });
  await Report.deleteMany({ reporter: userId });
  await AiUsage.deleteMany({ user: userId });
  await Book.updateMany({ disimpan: userId }, { $pull: { disimpan: userId } });
  await Discussion.updateMany({ likes: userId }, { $pull: { likes: userId }, $inc: { likeCount: -1 } });
  await Discussion.updateMany({ reposts: userId }, { $pull: { reposts: userId }, $inc: { repostCount: -1 } });
  await Discussion.updateMany({ lastRepostBy: userId }, { $unset: { lastRepostBy: 1 } });
}

module.exports = { recomputeRating, deleteBook, deleteUserContent };
