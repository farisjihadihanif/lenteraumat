// Unggah langsung ke Cloudinary (tiruan): API hanya menandatangani lalu memeriksa hasilnya.
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const h = require("./helpers");

const SECRET = "RahasiaTes";
const sha1 = (s) => crypto.createHash("sha1").update(s).digest("hex");
const proof = (public_id, version = 1700000000) => ({ public_id, version, signature: sha1(`public_id=${public_id}&version=${version}${SECRET}`) });

let app;
let storage;
const files = new Map(); // public_id -> isi
const removed = [];
const asli = globalThis.fetch;
before(async () => {
  process.env.CLOUDINARY_URL = `cloudinary://123456:${SECRET}@demo`;
  process.env.CLOUDINARY_MAX_MB = "1";
  app = await h.start();
  storage = require("../src/services/storage");
  storage.cloudinary.uploader.destroy = async (key) => removed.push(key);
  globalThis.fetch = async (url, opts) => {
    const m = /^https:\/\/res\.cloudinary\.com\/demo\/(raw|image)\/upload\/v\d+\/(.+)$/.exec(String(url));
    if (!m) return asli(url, opts);
    const isi = files.get(m[2]);
    return isi ? new Response(isi) : new Response("", { status: 404 });
  };
});
after(async () => {
  globalThis.fetch = asli;
  await h.stop();
});
beforeEach(async () => {
  await h.reset();
  files.clear();
  removed.length = 0;
});

const DATA = { judul: "Buku Sabar", penulis: "Ust. Ahmad", kategori: "Umum" };
async function unggah(agent, kind, isi, type = kind === "buku" ? "application/pdf" : "image/png") {
  const { body } = await agent.post("/api/uploads/sign").send({ kind, type, size: Math.min(isi.length, 1000) }).expect(200);
  files.set(body.fields.public_id, isi);
  return { ...proof(body.fields.public_id), sign: body };
}

test("tanda tangan: wajib masuk, cek jenis & ukuran, rahasia tidak ikut terkirim", async () => {
  await h.request(app).post("/api/uploads/sign").send({ kind: "buku", type: "application/pdf", size: 10 }).expect(401);
  const u = await h.makeUser(app);
  await u.post("/api/uploads/sign").send({ kind: "buku", type: "text/html", size: 10 }).expect(400);
  await u.post("/api/uploads/sign").send({ kind: "constructor", type: "application/pdf", size: 10 }).expect(400);
  await u.post("/api/uploads/sign").send({ kind: "buku", type: "application/pdf", size: 2 * 1048576 }).expect(400);
  const { body } = await u.post("/api/uploads/sign").send({ kind: "buku", type: "application/pdf", size: 10 }).expect(200);
  assert.equal(body.direct, true);
  assert.equal(body.url, "https://api.cloudinary.com/v1_1/demo/raw/upload");
  assert.ok(!JSON.stringify(body).includes(SECRET));
  const { api_key, signature, ...p } = body.fields;
  assert.equal(p.overwrite, "false");
  assert.equal(signature, sha1(Object.keys(p).sort().map((k) => `${k}=${p[k]}`).join("&") + SECRET));
});

test("simpan & ganti buku dari unggahan langsung", async () => {
  const u = await h.makeUser(app);
  const f = await unggah(u, "buku", h.makePdf(["satu", "dua"]));
  const c = await unggah(u, "sampul", h.PNG);
  const { book } = (await u.post("/api/books").send({ ...DATA, fileUpload: f, coverUpload: c }).expect(201)).body;
  assert.equal(book.halaman, 2);
  assert.equal(book.status, "menunggu");
  assert.equal(book.file.storage, "cloudinary");
  assert.equal(book.file.url, `https://res.cloudinary.com/demo/raw/upload/v1700000000/${f.public_id}`);
  assert.match(book.cover, /\/image\/upload\/v1700000000\/lenteraumat\/sampul\//);
  // unggahan yang sama tidak bisa dipakai dua kali, dan file buku pertama tidak ikut terhapus
  await u.post("/api/books").send({ ...DATA, fileUpload: f }).expect(409);
  assert.deepEqual(removed, []);
  const c2 = await unggah(u, "sampul", h.PNG);
  const r = (await u.patch(`/api/books/${book._id}`).send({ coverUpload: c2 }).expect(200)).body;
  assert.ok(r.book.cover.includes(c2.public_id));
  assert.deepEqual(removed, [c.public_id]);
});

test("unggahan yang ditandatangani di folder lama tetap diterima", async () => {
  const u = await h.makeUser(app);
  const { body } = await u.post("/api/uploads/sign").send({ kind: "buku", type: "application/pdf", size: 10 }).expect(200);
  const key = body.fields.public_id.replace("lenteraumat/", "lentera-umat/");
  files.set(key, h.makePdf());
  const { book } = (await u.post("/api/books").send({ ...DATA, fileUpload: proof(key) }).expect(201)).body;
  assert.equal(book.file.url, `https://res.cloudinary.com/demo/raw/upload/v1700000000/${key}`);
});

test("ditolak: tanda tangan palsu, milik orang lain, file palsu, terlalu besar, multipart", async () => {
  const a = await h.makeUser(app, "andi");
  const b = await h.makeUser(app, "bela");
  const f = await unggah(a, "buku", h.makePdf());
  await a.post("/api/books").send({ ...DATA, fileUpload: { ...f, signature: "0".repeat(40) } }).expect(400);
  await a.post("/api/books").send({ ...DATA, fileUpload: proof("lenteraumat/buku/lain.pdf") }).expect(400);
  await b.post("/api/books").send({ ...DATA, fileUpload: f }).expect(400);
  await a.post("/api/books").send({ ...DATA, coverUpload: f }).expect(400);
  assert.deepEqual(removed, []);
  const palsu = await unggah(a, "buku", Buffer.from("<html>bukan pdf</html>"));
  await a.post("/api/books").send({ ...DATA, fileUpload: palsu }).expect(400);
  const besar = await unggah(a, "buku", Buffer.concat([h.makePdf(), Buffer.alloc(1048577)]));
  assert.match((await a.post("/api/books").send({ ...DATA, fileUpload: besar }).expect(400)).body.message, /maksimal 1 MB/);
  const svg = await unggah(a, "sampul", Buffer.from("<svg></svg>"));
  await a.post("/api/books").send({ ...DATA, fileUpload: f, coverUpload: svg }).expect(400);
  assert.deepEqual(removed.sort(), [palsu.public_id, besar.public_id, svg.public_id, f.public_id].sort());
  await h.uploadBook(a).expect(400);
});
