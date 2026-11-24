const multer = require("multer");
const config = require("../config");
const { HttpError } = require("./errors");

const IMAGE = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// File ditahan di memori lalu diteruskan ke penyimpanan (lokal/Cloudinary).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxPdfMb * 1024 * 1024, files: 3 },
  fileFilter(req, file, cb) {
    if (file.fieldname === "file") {
      if (file.mimetype !== "application/pdf") return cb(new HttpError(400, "File buku harus PDF."));
      return cb(null, true);
    }
    if (["cover", "foto", "gambar"].includes(file.fieldname)) {
      if (!IMAGE.includes(file.mimetype)) return cb(new HttpError(400, "Gambar harus JPG, PNG, WEBP, atau GIF."));
      return cb(null, true);
    }
    cb(new HttpError(400, "Field file tidak dikenal."));
  },
});

// Batas gambar (MB), walaupun batas multer mengikuti ukuran PDF. Foto & gambar diskusi lewat body API.
const IMAGE_MB = { cover: 5, foto: 4, gambar: 4 };
function checkImageSize(...fields) {
  return (req, res, next) => {
    for (const f of fields) {
      const file = req.files?.[f]?.[0] || (req.file?.fieldname === f ? req.file : null);
      if (file && file.size > IMAGE_MB[f] * 1024 * 1024) throw new HttpError(400, `Ukuran gambar maksimal ${IMAGE_MB[f]} MB.`);
    }
    next();
  };
}

// PDF asli diawali "%PDF-"; cek isi, bukan hanya nama/tipe yang dikirim browser.
function isRealPdf(buffer) {
  return buffer?.subarray(0, 5).toString() === "%PDF-";
}

module.exports = { upload, checkImageSize, isRealPdf };
