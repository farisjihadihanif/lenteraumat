// Vercel: IP asli untuk batas percobaan, dan batas ukuran unggahan lewat body API.
process.env.VERCEL = "1";
const h = require("./helpers");
process.env.AUTH_RATE_LIMIT = "3";
process.env.RESET_RATE_LIMIT = "2";
// Jangan mengirim email sungguhan dari tes.
process.env.SMTP_USER = "";
process.env.SMTP_PASS = "";
process.env.NODE_ENV = "test";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const config = require("../src/config");
const { ipKey } = require("../src/middleware/clientIp");

const MB = 1024 * 1024;
let app;
before(async () => {
  app = await h.start();
});
after(h.stop);

const post = (path, headers, body) => h.request(app).post(`/api/auth${path}`).set(headers).send(body);
let n = 0;
const daftar = (headers) => post("/register", headers, { email: `salah${n++}`, username: `u${n}xx`, password: "x" });
const lupa = (headers, email = `orang${n++}@contoh.id`) => post("/forgot", headers, { email });

test("daftar: dibatasi per IP walau email berganti dan x-forwarded-for dipalsukan", async () => {
  for (let i = 0; i < 3; i++) await daftar({ "x-real-ip": "203.0.113.1", "x-forwarded-for": `198.51.100.${i}` }).expect(400);
  await daftar({ "x-real-ip": "203.0.113.1", "x-forwarded-for": "198.51.100.9" }).expect(429);
  // pengunjung lain lewat proxy yang sama tidak ikut terkunci
  await daftar({ "x-real-ip": "203.0.113.2", "x-forwarded-for": "198.51.100.9" }).expect(400);
});

test("tanpa x-real-ip: entri kanan x-forwarded-for yang dipakai", async () => {
  for (let i = 0; i < 3; i++) await daftar({ "x-forwarded-for": `10.9.8.${i}, 203.0.113.5` }).expect(400);
  await daftar({ "x-forwarded-for": "10.9.8.7, 203.0.113.5" }).expect(429);
  await daftar({ "x-forwarded-for": "10.9.8.7, 203.0.113.6" }).expect(400);
});

test("lupa password: dibatasi per IP dan juga per email", async () => {
  const ip = { "x-real-ip": "203.0.113.20" };
  await lupa(ip).expect(200);
  await lupa(ip).expect(200);
  await lupa(ip).expect(429);
  await lupa({ "x-real-ip": "203.0.113.21" }, "korban@contoh.id").expect(200);
  await lupa({ "x-real-ip": "203.0.113.22" }, "korban@contoh.id").expect(200);
  await lupa({ "x-real-ip": "203.0.113.23" }, "Korban@contoh.id").expect(429);
});

test("di luar Vercel x-real-ip dari pengunjung diabaikan", async () => {
  config.onVercel = false;
  try {
    for (let i = 0; i < 3; i++) await daftar({ "x-real-ip": `192.0.2.${i}`, "x-forwarded-for": "203.0.113.30" }).expect(400);
    await daftar({ "x-real-ip": "192.0.2.9", "x-forwarded-for": "203.0.113.30" }).expect(429);
  } finally {
    config.onVercel = true;
  }
});

test("IPv6 dikunci per /64", () => {
  assert.equal(ipKey({ ip: "2001:db8:0:1::5" }), ipKey({ ip: "2001:db8:0:1:aaaa:bbbb:cccc:1" }));
  assert.notEqual(ipKey({ ip: "2001:db8:0:1::5" }), ipKey({ ip: "2001:db8:0:2::5" }));
  assert.equal(ipKey({ ip: "::ffff:203.0.113.1" }), "203.0.113.1");
});

test("lampiran LUMA maksimal 4 MB per file dan total; gambar 4 MB", async () => {
  const user = await h.makeUser(app, "pembaca");
  const st = await h.request(app).get("/api/ai/status").expect(200);
  assert.equal(st.body.maxAttachMb, 4);
  const pdf = { filename: "a.pdf", contentType: "application/pdf" };
  const satu = await user.post("/api/ai/chat").field("message", "x").attach("lampiran", Buffer.alloc(4 * MB + 1), pdf).expect(400);
  assert.match(satu.body.message, /maksimal 4 MB per file/);
  const dua = await user.post("/api/ai/chat").field("message", "x").attach("lampiran", Buffer.alloc(3 * MB), pdf).attach("lampiran", Buffer.alloc(3 * MB), pdf).expect(400);
  assert.match(dua.body.message, /Total lampiran maksimal 4 MB/);
  const foto = await user.patch("/api/users/me").field("namaLengkap", "X").attach("foto", Buffer.alloc(4 * MB + 1), { filename: "a.png", contentType: "image/png" }).expect(400);
  assert.match(foto.body.message, /maksimal 4 MB/);
});
