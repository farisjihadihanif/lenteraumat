const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");
const importer = require("../src/services/importer");
const script = require("../scripts/impor-arsip");

let app;
before(async () => (app = await h.start()));
after(h.stop);

test("skrip impor arsip: domain publik, kategori dari subjek, lewati duplikat & PDF besar", async () => {
  await h.makeAdmin(app);
  const docs = [
    { identifier: "kitabislam1900", title: "The spirit of Islam", creator: "Ameer Ali", subject: ["Islam"], year: "1902", language: "eng" },
    { identifier: "birds1890", title: "Birds of Java", creator: ["Vorderman"], subject: "Birds", year: "1890", language: "dut", description: "<p>Burung</p>" },
    { identifier: "besar1910", title: "Atlas besar", subject: "Maps", year: "1910" },
  ];
  const queries = [];
  script.setFetchJson(async (url) => {
    if (url.includes("advancedsearch")) {
      queries.push(decodeURIComponent(url).replace(/\+/g, " "));
      return { response: { numFound: docs.length, docs: url.includes("page=1") ? docs : [] } };
    }
    const id = url.split("/metadata/")[1];
    if (id === "besar1910") return { files: [{ name: "besar.pdf", format: "Text PDF", size: String(900 * 1024 * 1024) }] };
    return { metadata: { imagecount: "212" }, files: [{ name: `${id}_bw.pdf`, format: "Grayscale PDF", size: "100" }, { name: `${id}.pdf`, format: "Text PDF", size: "2000" }] };
  });
  importer.setLookup(async () => [{ address: "207.241.224.2" }]);
  importer.setFetch(async () => {
    throw new Error("mode cepat tidak boleh mengunduh PDF");
  });
  const logs = [];
  const n = await script.run({ jumlah: 5, topik: "", bahasa: "", kering: false, salin: false }, (l) => logs.push(l));
  assert.equal(n, 2);
  assert.match(queries[0], /year:\[1500 TO 1928\]/);
  assert.match(queries[0], /-collection:bannedbooks/);
  const books = (await h.request(app).get("/api/books?limit=10")).body.items;
  const byTitle = Object.fromEntries(books.map((b) => [b.judul, b]));
  assert.equal(byTitle["The spirit of Islam"].kategori, "Akidah & Akhlak");
  assert.equal(byTitle["Birds of Java"].kategori, "Sains & Teknologi");
  assert.ok(logs.some((l) => /lewati "Atlas besar"/.test(l)));
  const detail = (await h.request(app).get(`/api/books/${byTitle["Birds of Java"]._id}`)).body.book;
  assert.equal(detail.sumber, "Internet Archive");
  assert.equal(detail.sumberUrl, "https://archive.org/details/birds1890");
  assert.match(detail.lisensi, /Domain publik/);
  assert.equal(detail.bahasa, "Belanda");
  assert.equal(detail.deskripsi, "Burung");
  // mode cepat: tidak mengunduh, cukup menautkan; jumlah halaman dari metadata
  assert.equal(detail.halaman, 212);
  assert.equal(detail.file.size, 2000);

  // membaca buku tertaut: Range diteruskan ke sumber (pdf.js cukup ambil sebagian)
  const realFetch = globalThis.fetch;
  const seenRange = [];
  globalThis.fetch = async (url, opts) => {
    seenRange.push([url, opts.headers.Range]);
    return new Response("%PDF-", { status: 206, headers: { "content-range": "bytes 0-4/2000", "content-length": "5", "accept-ranges": "bytes" } });
  };
  try {
    const part = await h.request(app).get(`/api/books/${detail._id}/file`).set("Range", "bytes=0-4").expect(206);
    assert.equal(part.headers["content-range"], "bytes 0-4/2000");
    assert.equal(part.headers["accept-ranges"], "bytes");
    assert.deepEqual(seenRange[0], ["https://archive.org/download/birds1890/birds1890.pdf", "bytes=0-4"]);
  } finally {
    globalThis.fetch = realFetch;
  }

  // dijalankan lagi: tidak ada duplikat
  assert.equal(await script.run({ jumlah: 5, topik: "", bahasa: "" }, () => {}), 0);

  // mode --salin: PDF diunduh dan teks LUMA langsung diambil
  docs.push({ identifier: "salin1920", title: "Kitab salinan", subject: "Islam", year: "1920" });
  importer.setFetch(async () => new Response(h.makePdf(["Isi buku domain publik tentang Islam."])));
  assert.equal(await script.run({ jumlah: 1, topik: "", bahasa: "", salin: true }, () => {}), 1);
});
