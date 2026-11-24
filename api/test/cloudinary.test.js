// Server Cloudinary tiruan: pesan asli harus tercatat, kunci tidak boleh bocor.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");

const KEY = "123456789014177";
const SECRET = "SangatRahasiaSekali";
let server;
let jawab;
let storage;
before(async () => {
  server = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => jawab(res));
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  process.env.CLOUDINARY_URL = `cloudinary://${KEY}:${SECRET}@demo?upload_prefix=http://127.0.0.1:${server.address().port}`;
  storage = require("../src/services/storage");
});
after(() => {
  server.closeAllConnections();
  server.close();
});

const kirim = (status, message, header = {}) => (res) => {
  res.writeHead(status, { "Content-Type": "application/json", ...header });
  res.end(JSON.stringify({ error: { message } }));
};
async function simpan(t) {
  const catat = t.mock.method(console, "error", () => {});
  let error;
  await storage.save({ buffer: Buffer.from("x"), mimetype: "image/jpeg", size: 1 }, "sampul").catch((e) => (error = e));
  return { error, log: catat.mock.calls.map((c) => c.arguments.join(" ")).join("\n") };
}

test("403: pesan asli dari Cloudinary yang dicatat", async (t) => {
  jawab = kirim(403, "x", { "x-cld-error": "Action not allowed for this key" });
  const { error, log } = await simpan(t);
  assert.equal(error.status, 502);
  assert.match(log, /http_code 403.*Action not allowed for this key/);
  assert.doesNotMatch(log, /unexpected status/);
});

test("kunci di pesan error disamarkan", async (t) => {
  jawab = kirim(401, `Invalid api_key ${KEY}`);
  const { error, log } = await simpan(t);
  assert.equal(error.status, 500);
  assert.match(log, /http_code 401.*Invalid api_key \.\.\.4177/);
  assert.ok(!log.includes(KEY) && !log.includes(SECRET));
});

test("cek:cloudinary melaporkan kegagalan & keberhasilan tanpa rahasia", async () => {
  const { run } = require("../scripts/cek-cloudinary");
  const baris = [];
  jawab = kirim(403, `Ditolak untuk ${KEY}`);
  assert.equal((await run({ log: (s) => baris.push(s) })).ok, false);
  jawab = (res) => res.writeHead(200).end('{"status":"ok"}');
  assert.equal((await run({ log: (s) => baris.push(s) })).ok, true);
  const semua = baris.join("\n");
  assert.match(semua, /http_code 403/);
  assert.match(semua, /Ditolak untuk \.\.\.4177/);
  assert.match(semua, /Cloud name : demo/);
  assert.ok(!semua.includes(KEY) && !semua.includes(SECRET));
});
