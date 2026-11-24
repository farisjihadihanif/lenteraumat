// Pintu masuk Vercel: tanpa listen, koneksi Mongo dipakai ulang, pulih setelah gagal.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const h = require("./helpers");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");

// Jangan pakai isi .env sungguhan di tes ini.
for (const k of ["MONGO_URL", "ADMIN_EMAIL", "ADMIN_PASSWORD"]) process.env[k] = "";

let mongod;
before(async () => {
  mongod = await MongoMemoryServer.create();
});
after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test("503 saat database gagal, lalu pulih dan hanya tersambung sekali", async (t) => {
  process.env.VERCEL = "1";
  const config = require("../src/config");
  t.mock.method(console, "error", () => {});
  t.mock.method(console, "warn", () => {});
  const handler = require("../api/index");
  config.mongoUrl = "";
  await h.request(handler).get("/api/health").expect(503);
  config.mongoUrl = mongod.getUri();
  const connect = t.mock.method(mongoose, "connect");
  await Promise.all([1, 2, 3].map(() => h.request(handler).get("/api/health").expect(200)));
  await h.request(handler).get("/api/books").expect(200);
  assert.equal(connect.mock.callCount(), 1);
  // tanpa CLOUDINARY_URL di Vercel: pesan jelas, bukan gagal menulis disk
  await assert.rejects(require("../src/services/storage").save({ buffer: Buffer.from("x"), mimetype: "image/png", size: 1 }, "sampul"), /CLOUDINARY_URL wajib/);
});

test("vercel.json: file yang dimuat saat jalan benar-benar ada", () => {
  const root = path.join(__dirname, "..");
  const cfg = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  const list = cfg.functions["api/index.js"].includeFiles.slice(1, -1).split(",");
  for (const f of list) assert.ok(fs.existsSync(path.join(root, f.replace("/**", ""))), f);
  assert.ok(fs.existsSync(path.join(root, cfg.outputDirectory, "robots.txt")));
});
