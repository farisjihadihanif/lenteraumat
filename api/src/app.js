const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const config = require("./config");
const { clientIp } = require("./middleware/clientIp");
const { loadUser } = require("./middleware/auth");
const { notFound, errorHandler } = require("./middleware/errors");

function createApp() {
  const app = express();
  // Tepat satu proxy di depan: Nginx (VPS) atau edge Vercel.
  app.set("trust proxy", 1);
  app.use(clientIp);
  app.disable("x-powered-by");
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: {
        directives: {
          "default-src": ["'self'"],
          // 'wasm-unsafe-eval': dekoder gambar pdf.js (JPEG2000) berbentuk WebAssembly
          "script-src": ["'self'", "'wasm-unsafe-eval'"],
          "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
          // sampul & foto bisa dari Cloudinary; blob: untuk pratinjau sampul sebelum unggah
          "img-src": ["'self'", "data:", "blob:", "https:"],
          // pdf.js memakai web worker & mengambil PDF dari Cloudinary bila dipakai
          "worker-src": ["'self'", "blob:"],
          "connect-src": ["'self'", "https:"],
          "object-src": ["'none'"],
          "frame-ancestors": ["'self'"],
        },
      },
    }),
  );
  app.use(
    cors({
      origin(origin, cb) {
        // Tanpa Origin = curl/Postman/server-ke-server.
        if (!origin || config.clientOrigins.includes(origin.replace(/\/+$/, ""))) return cb(null, true);
        cb(null, false);
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use("/uploads", express.static(config.uploadDir, { maxAge: "7d", fallthrough: false }));
  app.use(loadUser);

  app.get("/api/health", (req, res) => res.json({ ok: true }));
  // Info publik untuk halaman Privasi & Hak cipta.
  app.get("/api/site", (req, res) => res.json({ contactEmail: config.contactEmail }));
  app.use("/api/auth", require("./routes/auth"));
  app.use("/api/users", require("./routes/users"));
  app.use("/api/books", require("./routes/books"));
  app.use("/api/reviews", require("./routes/reviews"));
  app.use("/api/discussions", require("./routes/discussions"));
  app.use("/api/admin", require("./routes/admin"));
  app.use("/api/ai", require("./routes/ai"));
  app.use("/api/uploads", require("./routes/uploads"));
  app.use("/api/reports", require("./routes/reports"));

  app.use("/api", notFound);

  // Kalau frontend sudah di-build (client/dist), server ini bisa sekalian
  // menyajikannya: cukup satu domain untuk web + API.
  const dist = process.env.CLIENT_DIST || path.join(__dirname, "..", "..", "client", "dist");
  if (require("fs").existsSync(path.join(dist, "index.html"))) {
    app.use(express.static(dist, { index: false, maxAge: "1h" }));
    app.get(/^\/(?!api|uploads).*/, (req, res) => res.sendFile(path.join(dist, "index.html")));
  }

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
