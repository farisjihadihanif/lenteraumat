// Pembaca di Vercel: hanya potongan kecil (206), galat tidak di-cache, sumber tanpa Range tetap terbuka.
process.env.VERCEL = "1";
const h = require("./helpers");
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const fs = require("fs");
const path = require("path");
const Book = require("../src/models/Book");
const User = require("../src/models/User");
const { parseRange, MAX_CHUNK } = require("../src/services/pdfRange");

const FILE = Buffer.alloc(6 * 1024 * 1024);
for (let i = 0; i < FILE.length; i++) FILE[i] = (i * 31 + (i >> 8)) % 251;
FILE.write("%PDF-1.4\n");

let app, server, base, hits, down, admin;
before(async () => {
  app = await h.start();
  await h.makeAdmin(app);
  admin = await User.findOne({ role: "admin" });
  server = http.createServer((req, res) => {
    hits.push(req.url);
    if (req.url === "/html") return res.end("<html>verifikasi</html>");
    if (req.url === "/pindah") return res.writeHead(302, { Location: `${base}/range` }).end();
    if (req.url === "/blokir") return res.writeHead(403).end();
    if (down-- > 0) return req.socket.destroy();
    const m = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || "");
    if (req.url === "/utuh" || !m) return res.end(FILE);
    const s = Number(m[1]);
    const e = Math.min(Number(m[2]), FILE.length - 1);
    if (s >= FILE.length) return res.writeHead(416, { "Content-Range": `bytes */${FILE.length}` }).end();
    res.writeHead(206, { "Content-Range": `bytes ${s}-${e}/${FILE.length}`, "Content-Length": e - s + 1 });
    res.end(FILE.subarray(s, e + 1));
  });
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.close();
  server.closeAllConnections();
  await h.stop();
});
beforeEach(() => {
  hits = [];
  down = 0;
});

const buku = async (jalur, file = {}) =>
  (await Book.create({ judul: "X", penulis: "Y", file: { url: base + jalur, storage: "external", size: FILE.length, ...file }, uploadedBy: admin._id, status: "disetujui" }))._id;
const ambil = (id, range) => {
  const r = h.request(app).get(`/api/books/${id}/file`).buffer(true).parse((res, cb) => {
    const d = [];
    res.on("data", (c) => d.push(c));
    res.on("end", () => cb(null, Buffer.concat(d)));
  });
  return range ? r.set("Range", range) : r;
};

test("parseRange", () => {
  assert.deepEqual(parseRange("bytes=0-9"), { start: 0, end: 9 });
  assert.deepEqual(parseRange("bytes=5-"), { start: 5, end: Infinity });
  assert.deepEqual(parseRange("bytes=-8"), { suffix: 8 });
  for (const salah of ["", "bytes=-", "bytes=9-1", "bytes=0-1,4-5", "baris=0-1"]) assert.equal(parseRange(salah), null);
});

for (const jalur of ["/range", "/utuh", "/pindah"]) {
  test(`potongan benar dan dibatasi: ${jalur}`, async () => {
    const id = await buku(jalur);
    const a = await ambil(id, "bytes=1000-1999").expect(206);
    assert.equal(a.headers["content-range"], `bytes 1000-1999/${FILE.length}`);
    assert.equal(a.headers["content-length"], "1000");
    assert.equal(a.headers["accept-ranges"], "bytes");
    assert.ok(a.body.equals(FILE.subarray(1000, 2000)));
    assert.match(a.headers["cache-control"], /private/);
    assert.equal(a.headers["cdn-cache-control"], "no-store");
    const b = await ambil(id, "bytes=0-").expect(206);
    assert.equal(b.body.length, MAX_CHUNK);
    assert.ok(b.body.equals(FILE.subarray(0, MAX_CHUNK)));
    assert.ok((await ambil(id, "bytes=-10").expect(206)).body.equals(FILE.subarray(-10)));
    const d = await ambil(id, `bytes=${FILE.length}-${FILE.length + 5}`).expect(416);
    assert.equal(d.headers["content-range"], `bytes */${FILE.length}`);
    // sumber tanpa Range cukup diunduh sekali; pengalihan cukup diikuti sekali
    if (jalur === "/utuh") assert.equal(hits.length, 1);
    if (jalur === "/pindah") assert.equal(hits.filter((x) => x === "/pindah").length, 1);
  });
}

test("tanpa Range ditolak, sumber tidak disentuh", async () => {
  const r = await ambil(await buku("/range")).expect(416);
  assert.equal(r.headers["content-range"], `bytes */${FILE.length}`);
  assert.equal(r.headers["cache-control"], "no-store");
  assert.equal(hits.length, 0);
});

test("file lokal juga dipotong", async () => {
  const dir = path.join(process.env.UPLOAD_DIR, "buku");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "besar.pdf"), FILE);
  const id = await buku("/x", { storage: "local", key: "buku/besar.pdf" });
  assert.equal((await ambil(id, "bytes=0-").expect(206)).body.length, MAX_CHUNK);
  assert.ok((await ambil(id, "bytes=-10").expect(206)).body.equals(FILE.subarray(-10)));
});

test("gangguan sesaat dicoba lagi; galat tidak boleh di-cache", async (t) => {
  t.mock.method(console, "error", () => {});
  const id = await buku("/pindah");
  await ambil(id, "bytes=0-99").expect(206);
  down = 1; // server cermin yang diingat mati: ulang dari alamat aslinya
  await ambil(id, "bytes=0-99").expect(206);
  down = 99;
  const r = await ambil(id, "bytes=0-99").expect(502);
  assert.equal(r.headers["cache-control"], "no-store");
  for (const jalur of ["/html", "/blokir"]) {
    const x = await ambil(await buku(jalur), "bytes=0-4095").expect(502);
    assert.equal(x.headers["cache-control"], "no-store");
  }
});

test("alamat langsung hanya untuk Cloudinary", async () => {
  const luar = await h.request(app).get(`/api/books/${await buku("/range")}`).expect(200);
  assert.equal(luar.body.book.file.direct, "");
  const url = "https://res.cloudinary.com/x/raw/upload/v1/a.pdf";
  const r = await h.request(app).get(`/api/books/${await buku("", { url, storage: "cloudinary" })}`).expect(200);
  assert.equal(r.body.book.file.direct, url);
});

// archive.org: alamat unduhan mengalihkan ke server yang mati -> pakai server lain dari metadata.
test("server archive.org mati: pindah ke cermin lain", async (t) => {
  const asli = globalThis.fetch;
  const minta = [];
  t.mock.method(globalThis, "fetch", async (url, opts) => {
    url = String(url);
    if (!/archive\.org/.test(url)) return asli(url, opts);
    minta.push(url);
    if (url === "https://archive.org/metadata/buku1") return Response.json({ dir: "/1/items/buku1", workable_servers: ["ia800001.us.archive.org", "jahat.contoh.id"], d1: "ia900001.us.archive.org" });
    if (!url.startsWith("https://ia900001.")) throw new TypeError("fetch failed");
    return new Response(FILE.subarray(0, 2000), { status: 206, headers: { "Content-Range": `bytes 0-1999/${FILE.length}` } });
  });
  const id = await buku("", { url: "https://archive.org/download/buku1/buku1.pdf" });
  const r = await ambil(id, "bytes=0-1999").expect(206);
  assert.ok(r.body.equals(FILE.subarray(0, 2000)));
  assert.equal(minta.at(-1), "https://ia900001.us.archive.org/1/items/buku1/buku1.pdf");
  assert.ok(!minta.some((u) => u.includes("jahat")));
});
