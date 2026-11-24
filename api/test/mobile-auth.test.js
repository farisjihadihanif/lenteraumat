// Aplikasi mobile: token Bearer di balasan, tanpa cookie. Web tetap memakai cookie httpOnly.
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");

let app;
before(async () => {
  process.env.AUTH_RATE_LIMIT = "10000";
  process.env.REFRESH_RATE_LIMIT = "4";
  app = await h.start();
});
after(h.stop);
beforeEach(h.reset);

const M = { "X-Client": "mobile" };
const akun = { username: "faris", email: "faris@lu.id", password: "rahasia123", namaLengkap: "Faris" };
const daftar = () => h.request(app).post("/api/auth/register").set(M).send(akun).expect(201);
const masuk = (password = akun.password) => h.request(app).post("/api/auth/login").set(M).send({ identifier: akun.email, password });
const bearer = (t) => ({ Authorization: `Bearer ${t}` });

test("daftar & masuk dari aplikasi: token di balasan, tanpa cookie", async () => {
  const r = await daftar();
  const l = await masuk().expect(200);
  for (const x of [r, l]) {
    assert.ok(x.body.token);
    assert.equal(x.headers["set-cookie"], undefined);
    assert.equal(x.headers["cache-control"], "no-store");
  }
  const me = await h.request(app).get("/api/auth/me").set(bearer(l.body.token)).expect(200);
  assert.equal(me.body.user.username, "faris");
  assert.equal(me.body.token, undefined); // tanpa X-Client: tidak ada token baru
});

test("web tetap memakai cookie dan tidak pernah menerima token", async () => {
  await daftar();
  const web = await h.request(app).post("/api/auth/login").send({ identifier: akun.email, password: akun.password }).expect(200);
  assert.equal(web.body.token, undefined);
  assert.match(String(web.headers["set-cookie"]), /lenteraumat_token=.*HttpOnly/);
  // Halaman web yang meniru header aplikasi tetap dianggap web.
  for (const tanda of [{ Origin: "http://localhost:5173" }, { "Sec-Fetch-Site": "same-origin" }]) {
    const palsu = await h.request(app).post("/api/auth/login").set({ ...M, ...tanda }).send({ identifier: akun.email, password: akun.password }).expect(200);
    assert.equal(palsu.body.token, undefined);
    assert.ok(palsu.headers["set-cookie"]);
  }
  // Cookie + header aplikasi tanpa Bearer: tidak menukar cookie dengan token.
  const me = await h.request(app).get("/api/auth/me").set(M).set("Cookie", web.headers["set-cookie"].map((c) => c.split(";")[0]).join("; ")).expect(200);
  assert.equal(me.body.user.username, "faris");
  assert.equal(me.body.token, undefined);
});

test("CORS: X-Client tidak diizinkan untuk browser, header web tetap", async () => {
  const r = await h.request(app).options("/api/auth/login").set({ Origin: "http://localhost:5173", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "x-client,content-type" });
  const izin = String(r.headers["access-control-allow-headers"]).toLowerCase();
  assert.ok(!izin.includes("x-client"));
  assert.ok(izin.includes("content-type") && izin.includes("range"));
});

test("Bearer didahulukan dari cookie", async () => {
  const { body } = await daftar();
  const web = await h.makeUser(app, "lain");
  const me = await web.get("/api/auth/me").set(bearer(body.token)).expect(200);
  assert.equal(me.body.user.username, "faris");
  // Bearer rusak tidak jatuh ke cookie.
  const rusak = await web.get("/api/auth/me").set(bearer("rusak")).expect(200);
  assert.equal(rusak.body.user, null);
});

test("token mati: /me dari aplikasi membalas 401", async () => {
  await h.request(app).get("/api/auth/me").set(M).set(bearer("rusak")).expect(401);
  await h.request(app).get("/api/auth/me").set(M).expect(200); // tamu
});

test("/me memperpanjang token aplikasi dan dibatasi", async () => {
  const { body } = await daftar();
  for (let i = 0; i < 3; i++) {
    const r = await h.request(app).get("/api/auth/me").set(M).set(bearer(body.token)).expect(200);
    assert.ok(r.body.token);
    assert.equal(r.headers["set-cookie"], undefined);
    await h.request(app).get("/api/books/mine").set(bearer(r.body.token)).expect(200);
  }
  await h.request(app).get("/api/auth/me").set(M).set(bearer(body.token)).expect(429);
  // Web (tanpa perpanjangan) tidak ikut dibatasi.
  await h.request(app).get("/api/auth/me").set(bearer(body.token)).expect(200);
});

test("ganti password: token baru, token lama mati; hapus akun mematikan token", async () => {
  const { body } = await daftar();
  const r = await h.request(app).put("/api/users/me/password").set(M).set(bearer(body.token)).send({ passwordLama: akun.password, passwordBaru: "rahasiabaru1" }).expect(200);
  assert.ok(r.body.token);
  assert.equal(r.headers["set-cookie"], undefined);
  await h.request(app).get("/api/books/mine").set(bearer(body.token)).expect(401);
  await h.request(app).get("/api/books/mine").set(bearer(r.body.token)).expect(200);
  await h.request(app).delete("/api/users/me").set(M).set(bearer(r.body.token)).send({ password: "rahasiabaru1" }).expect(200);
  await h.request(app).get("/api/books/mine").set(bearer(r.body.token)).expect(401);
});
