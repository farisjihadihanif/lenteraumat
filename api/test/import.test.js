const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");
const importer = require("../src/services/importer");
const gemini = require("../src/services/gemini");

let app;
before(async () => {
  app = await h.start();
  importer.setLookup(async (host) => [{ address: host === "lokal.test" ? "10.0.0.5" : "93.184.216.34" }]);
});
after(h.stop);
beforeEach(h.reset);

function servePdf(pdf, { status = 200, redirectTo = null } = {}) {
  const calls = [];
  importer.setFetch(async (url) => {
    calls.push(url);
    if (redirectTo && !url.includes("final")) return new Response(null, { status: 302, headers: { location: redirectTo } });
    return new Response(pdf, { status, headers: { "content-length": String(pdf.length) } });
  });
  return calls;
}

const meta = { judul: "Buku Fikih Terbuka", penulis: "Kemendikdasmen", kategori: "Fikih", sumber: "SIBI Kemendikdasmen", lisensi: "Bebas disebarluaskan" };

test("admin mengimpor buku dari tautan PDF (langsung tayang, dengan atribusi)", async () => {
  const admin = await h.makeAdmin(app);
  const calls = servePdf(h.makePdf(["Bab satu fikih thaharah dan wudhu untuk pemula."]), { redirectTo: "https://cdn.contoh.id/final/buku.pdf" });
  const r = await admin.post("/api/admin/books/import").send({ url: "https://buku.contoh.id/buku.pdf", ...meta }).expect(201);
  assert.equal(r.body.book.status, "disetujui");
  assert.equal(r.body.book.sumber, "SIBI Kemendikdasmen");
  assert.equal(r.body.book.sumberUrl, "https://buku.contoh.id/buku.pdf");
  assert.equal(r.body.book.halaman, 1);
  assert.equal(calls.length, 2); // ikut pengalihan
  const pub = await h.request(app).get(`/api/books/${r.body.book._id}`).expect(200);
  assert.equal(pub.body.book.lisensi, "Bebas disebarluaskan");
  // impor ganda ditolak
  await admin.post("/api/admin/books/import").send({ url: "https://buku.contoh.id/buku.pdf", ...meta }).expect(409);
});

test("impor: wajib sumber & lisensi, hanya admin, tolak non-PDF dan jaringan lokal", async () => {
  const admin = await h.makeAdmin(app);
  const user = await h.makeUser(app, "faris");
  servePdf(h.makePdf());
  await user.post("/api/admin/books/import").send({ url: "https://a.id/x.pdf", ...meta }).expect(403);
  await admin.post("/api/admin/books/import").send({ url: "https://a.id/x.pdf", ...meta, sumber: "" }).expect(400);
  await admin.post("/api/admin/books/import").send({ url: "https://a.id/x.pdf", ...meta, lisensi: "" }).expect(400);
  await admin.post("/api/admin/books/import").send({ url: "ftp://a.id/x.pdf", ...meta }).expect(400);
  await admin.post("/api/admin/books/import").send({ url: "http://127.0.0.1/x.pdf", ...meta }).expect(400);
  await admin.post("/api/admin/books/import").send({ url: "http://lokal.test/x.pdf", ...meta }).expect(400);
  servePdf(Buffer.from("<html>bukan pdf</html>"));
  const r = await admin.post("/api/admin/books/import").send({ url: "https://a.id/halaman", ...meta }).expect(400);
  assert.match(r.body.message, /PDF/);
});

test("impor: kategori baru dibuat otomatis", async () => {
  const admin = await h.makeAdmin(app);
  servePdf(h.makePdf());
  const r = await admin.post("/api/admin/books/import").send({ url: "https://a.id/y.pdf", ...meta, kategori: "Astronomi" }).expect(201);
  assert.equal(r.body.book.kategori, "Astronomi");
  const cats = (await h.request(app).get("/api/books/categories")).body.categories;
  assert.ok(cats.some((c) => c.name === "Astronomi" && c.count === 1));
});

test("admin kelola kategori: tambah, ganti nama (ikut ke buku), hapus (buku pindah ke Umum)", async () => {
  const admin = await h.makeAdmin(app);
  const user = await h.makeUser(app, "faris");
  const cats = (await admin.get("/api/admin/categories").expect(200)).body.items;
  assert.ok(cats.length >= 10);
  await user.post("/api/admin/categories").send({ nama: "X" }).expect(403);
  const c = (await admin.post("/api/admin/categories").send({ nama: "Tasawuf" }).expect(201)).body.category;
  await admin.post("/api/admin/categories").send({ nama: "tasawuf" }).expect(409);
  const book = (await h.uploadBook(admin, { kategori: "Tasawuf" }).expect(201)).body.book;
  await admin.patch(`/api/admin/categories/${c._id}`).send({ nama: "Tasawuf & Adab" }).expect(200);
  assert.equal((await h.request(app).get(`/api/books/${book._id}`)).body.book.kategori, "Tasawuf & Adab");
  const r = await admin.delete(`/api/admin/categories/${c._id}`).expect(200);
  assert.equal(r.body.dipindah, 1);
  assert.equal((await h.request(app).get(`/api/books/${book._id}`)).body.book.kategori, "Umum");
  const umum = (await admin.get("/api/admin/categories")).body.items.find((x) => x.nama === "Umum");
  await admin.delete(`/api/admin/categories/${umum._id}`).expect(400);
  // user biasa tidak bisa membuat kategori baru lewat unggah
  await h.uploadBook(user, { kategori: "Kategori Ngawur" }).expect(400);
});

test("unggah biasa bisa mencantumkan sumber & lisensi", async () => {
  const user = await h.makeUser(app, "faris");
  const r = await h.uploadBook(user, { sumber: "Karya sendiri", lisensi: "CC BY 4.0", sumberUrl: "javascript:alert(1)" }).expect(400);
  assert.match(r.body.message, /Tautan sumber/);
  const ok = await h.uploadBook(user, { sumber: "Karya sendiri", lisensi: "CC BY 4.0" }).expect(201);
  assert.equal(ok.body.book.lisensi, "CC BY 4.0");
});

test("LUMA mencoba ulang & memakai model cadangan saat Google sibuk", async () => {
  const user = await h.makeUser(app, "faris");
  const models = [];
  gemini.setFetch(async (url) => {
    models.push(url.match(/models\/([^:]+)/)[1]);
    if (models.length < 3) return new Response(JSON.stringify({ error: { message: "overloaded" } }), { status: 503 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Jawaban cadangan" }] } }] }), { status: 200 });
  });
  const r = await user.post("/api/ai/chat").send({ message: "halo" }).expect(200);
  assert.equal(r.body.reply, "Jawaban cadangan");
  assert.deepEqual(models, ["gemini-flash-latest", "gemini-flash-latest", "gemini-2.5-flash"]);
  gemini.setFetch(async () => new Response(JSON.stringify({ error: { message: "overloaded" } }), { status: 503 }));
  const fail = await user.post("/api/ai/chat").send({ message: "halo" }).expect(502);
  assert.match(fail.body.message, /gagal menjawab/);
});
