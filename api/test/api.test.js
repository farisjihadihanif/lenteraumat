const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");

let app;
before(async () => (app = await h.start()));
after(h.stop);
beforeEach(h.reset);

test("daftar, masuk, me, keluar", async () => {
  const agent = await h.makeUser(app, "faris");
  const me = await agent.get("/api/auth/me").expect(200);
  assert.equal(me.body.user.username, "faris");
  assert.equal(me.body.user.role, "user");
  assert.equal(me.body.user.password, undefined);

  // role tidak bisa dipilih sendiri saat daftar
  const sneaky = await h.request(app).post("/api/auth/register").send({ username: "nakal", email: "n@lu.id", password: "rahasia123", namaLengkap: "N", role: "admin" }).expect(201);
  assert.equal(sneaky.body.user.role, "user");

  await h.request(app).post("/api/auth/register").send({ username: "faris", email: "x@lu.id", password: "rahasia123", namaLengkap: "X" }).expect(409);
  await h.request(app).post("/api/auth/login").send({ identifier: "faris", password: "salah12345" }).expect(401);
  await h.request(app).post("/api/auth/login").send({ identifier: "faris@lu.id", password: "rahasia123" }).expect(200);

  await agent.post("/api/auth/logout").expect(200);
  const after = await agent.get("/api/auth/me").expect(200);
  assert.equal(after.body.user, null);
});

test("ganti password mengeluarkan sesi lama", async () => {
  const agent = await h.makeUser(app, "budi");
  const other = h.request.agent(app);
  await other.post("/api/auth/login").send({ identifier: "budi", password: "rahasia123" }).expect(200);
  await agent.put("/api/users/me/password").send({ passwordLama: "salah", passwordBaru: "barubaru123" }).expect(400);
  await agent.put("/api/users/me/password").send({ passwordLama: "rahasia123", passwordBaru: "barubaru123" }).expect(200);
  assert.equal((await agent.get("/api/auth/me")).body.user.username, "budi");
  assert.equal((await other.get("/api/auth/me")).body.user, null);
});

test("unggahan user menunggu persetujuan, admin langsung tayang", async () => {
  const admin = await h.makeAdmin(app);
  const user = await h.makeUser(app, "faris");
  const guest = h.request(app);

  await guest.post("/api/books").expect(401);

  const up = await h.uploadBook(user, { judul: "Kisah Para Nabi" }).expect(201);
  assert.equal(up.body.book.status, "menunggu");
  assert.equal(up.body.book.halaman, 1);
  const id = up.body.book._id;

  // belum tayang: tamu tidak bisa lihat, pengunggah & admin bisa
  await guest.get(`/api/books/${id}`).expect(404);
  await guest.get(`/api/books/${id}/file`).expect(404);
  await user.get(`/api/books/${id}`).expect(200);
  assert.equal((await guest.get("/api/books")).body.total, 0);

  const mine = await user.get("/api/books/mine").expect(200);
  assert.equal(mine.body.items.length, 1);

  const adm = await h.uploadBook(admin, { judul: "Fikih Dasar", kategori: "Fikih" }).expect(201);
  assert.equal(adm.body.book.status, "disetujui");

  const list = await guest.get("/api/books").expect(200);
  assert.equal(list.body.total, 1);
  assert.equal(list.body.items[0].judul, "Fikih Dasar");

  const file = await guest
    .get(`/api/books/${adm.body.book._id}/file`)
    .buffer(true)
    .parse((res, cb) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    })
    .expect(200);
  // bukan application/pdf supaya tidak disergap download manager
  assert.equal(file.headers["content-type"], "application/x-lentera-book");
  assert.equal(file.headers["content-disposition"], undefined);
  assert.equal(file.body.subarray(0, 5).toString(), "%PDF-");
});

test("validasi unggah: wajib PDF asli dan data lengkap", async () => {
  const user = await h.makeUser(app, "faris");
  await user.post("/api/books").field("judul", "A").field("penulis", "B").expect(400);
  await h.uploadBook(user, {}, Buffer.from("bukan pdf")).expect(400);
  await h.uploadBook(user, { judul: "" }).expect(400);
  await h.uploadBook(user, { kategori: "Donasi" }).expect(400);
  await user
    .post("/api/books")
    .field("judul", "A")
    .field("penulis", "B")
    .attach("file", Buffer.from("x"), { filename: "a.exe", contentType: "application/octet-stream" })
    .expect(400);
});

test("admin meninjau: setujui, tolak wajib alasan, minta revisi", async () => {
  const admin = await h.makeAdmin(app);
  const user = await h.makeUser(app, "faris");
  const a = (await h.uploadBook(user, { judul: "Buku A" })).body.book._id;
  const b = (await h.uploadBook(user, { judul: "Buku B" })).body.book._id;
  const c = (await h.uploadBook(user, { judul: "Buku C" })).body.book._id;

  await user.post(`/api/admin/books/${a}/review`).send({ action: "setujui" }).expect(403);

  const pending = await admin.get("/api/admin/books?status=menunggu").expect(200);
  assert.equal(pending.body.total, 3);
  const stats = await admin.get("/api/admin/stats").expect(200);
  assert.equal(stats.body.books.menunggu, 3);

  await admin.post(`/api/admin/books/${a}/review`).send({ action: "setujui" }).expect(200);
  await admin.post(`/api/admin/books/${b}/review`).send({ action: "tolak" }).expect(400);
  const tolak = await admin.post(`/api/admin/books/${b}/review`).send({ action: "tolak", catatan: "Melanggar hak cipta" }).expect(200);
  assert.equal(tolak.body.book.status, "ditolak");
  await admin.post(`/api/admin/books/${c}/review`).send({ action: "revisi", catatan: "Sampul buram" }).expect(200);

  const mine = (await user.get("/api/books/mine")).body.items;
  const byJudul = Object.fromEntries(mine.map((x) => [x.judul, x]));
  assert.equal(byJudul["Buku A"].status, "disetujui");
  assert.equal(byJudul["Buku B"].catatanReview, "Melanggar hak cipta");
  assert.equal(byJudul["Buku C"].status, "revisi");

  // user memperbaiki buku revisi -> kembali menunggu
  const fix = await user.patch(`/api/books/${c}`).field("deskripsi", "Sampul baru").attach("cover", h.PNG, { filename: "c.png", contentType: "image/png" }).expect(200);
  assert.equal(fix.body.book.status, "menunggu");
  assert.ok(fix.body.book.cover.includes("/uploads/sampul/"));

  assert.equal((await h.request(app).get("/api/books")).body.total, 1);
});

test("hak akses ubah & hapus buku", async () => {
  await h.makeAdmin(app);
  const owner = await h.makeUser(app, "pemilik");
  const other = await h.makeUser(app, "orang");
  const id = (await h.uploadBook(owner)).body.book._id;
  await other.patch(`/api/books/${id}`).field("judul", "X").expect(404); // tidak terlihat
  await other.delete(`/api/books/${id}`).expect(404);
  await owner.delete(`/api/books/${id}`).expect(200);
  await owner.get(`/api/books/${id}`).expect(404);
});

test("ulasan: rating rata-rata, satu ulasan per user, hapus oleh admin", async () => {
  const admin = await h.makeAdmin(app);
  const u1 = await h.makeUser(app, "satu");
  const u2 = await h.makeUser(app, "dua");
  const id = (await h.uploadBook(admin)).body.book._id;

  await h.request(app).put(`/api/books/${id}/reviews`).send({ rating: 5 }).expect(401);
  await u1.put(`/api/books/${id}/reviews`).send({ rating: 9 }).expect(400);
  await u1.put(`/api/books/${id}/reviews`).send({ rating: 5, komentar: "Bagus sekali" }).expect(200);
  const r2 = await u2.put(`/api/books/${id}/reviews`).send({ rating: 2, komentar: "Kurang" }).expect(200);
  assert.equal(r2.body.ratingAvg, 3.5);
  // ubah ulasan, bukan menambah
  const r3 = await u2.put(`/api/books/${id}/reviews`).send({ rating: 4 }).expect(200);
  assert.equal(r3.body.ratingCount, 2);
  assert.equal(r3.body.ratingAvg, 4.5);

  const list = await u1.get(`/api/books/${id}/reviews`).expect(200);
  assert.equal(list.body.total, 2);
  assert.equal(list.body.mine.rating, 5);
  assert.equal(list.body.distribution.find((d) => d.star === 4).count, 1);

  const reviewId = list.body.mine._id;
  await u2.delete(`/api/reviews/${reviewId}`).expect(403);
  const mod = await admin.get("/api/admin/reviews").expect(200);
  assert.equal(mod.body.total, 2);
  await admin.delete(`/api/admin/reviews/${reviewId}`).expect(200);
  const book = await h.request(app).get(`/api/books/${id}`).expect(200);
  assert.equal(book.body.book.ratingAvg, 4);
  assert.equal(book.body.book.ratingCount, 1);
});

test("pengunggah tidak bisa mengulas bukunya sendiri", async () => {
  const admin = await h.makeAdmin(app);
  const user = await h.makeUser(app, "faris");
  const id = (await h.uploadBook(user)).body.book._id;
  await admin.post(`/api/admin/books/${id}/review`).send({ action: "setujui" }).expect(200);
  await user.put(`/api/books/${id}/reviews`).send({ rating: 5 }).expect(400);
});

test("katalog: cari, kategori, simpan, progres baca", async () => {
  const admin = await h.makeAdmin(app);
  const user = await h.makeUser(app, "faris");
  const a = (await h.uploadBook(admin, { judul: "Tafsir Juz Amma", kategori: "Al-Qur'an & Tafsir" })).body.book._id;
  await h.uploadBook(admin, { judul: "Belajar Python", kategori: "Teknologi", penulis: "Guido" });

  assert.equal((await h.request(app).get("/api/books?q=tafsir")).body.total, 1);
  assert.equal((await h.request(app).get("/api/books?q=guido")).body.total, 1);
  assert.equal((await h.request(app).get("/api/books?q=(((")).body.total, 0);
  assert.equal((await h.request(app).get("/api/books?kategori=Teknologi")).body.total, 1);
  const cats = (await h.request(app).get("/api/books/categories")).body.categories;
  assert.equal(cats.find((c) => c.name === "Al-Qur'an & Tafsir").count, 1);

  assert.equal((await user.post(`/api/books/${a}/save`).expect(200)).body.saved, true);
  assert.equal((await user.get(`/api/books/${a}`)).body.book.saved, true);
  assert.equal((await user.get("/api/books/saved")).body.items.length, 1);
  assert.equal((await user.post(`/api/books/${a}/save`)).body.saved, false);

  await user.put(`/api/books/${a}/progress`).send({ page: 99 }).expect(200); // dibatasi jumlah halaman
  assert.equal((await user.get(`/api/books/${a}/progress`)).body.page, 1);
  const cont = await user.get("/api/books/continue").expect(200);
  assert.equal(cont.body.items[0].book.judul, "Tafsir Juz Amma");

  await h.request(app).post(`/api/books/${a}/read`).expect(200);
  assert.equal((await h.request(app).get(`/api/books/${a}`)).body.book.dibaca, 1);
});

test("diskusi tentang buku dan balasan", async () => {
  const admin = await h.makeAdmin(app);
  const user = await h.makeUser(app, "faris");
  const other = await h.makeUser(app, "teman");
  const book = (await h.uploadBook(admin)).body.book._id;

  await h.request(app).post("/api/discussions").send({ judul: "X", isi: "panjang sekali" }).expect(401);
  await user.post("/api/discussions").send({ judul: "", isi: "isi diskusi panjang" }).expect(400);
  const d = await user.post("/api/discussions").send({ judul: "Makna sabar di bab 2", isi: "Menurut kalian bagaimana penjelasan sabar di bab 2?", book }).expect(201);
  const id = d.body.discussion._id;

  const c = await other.post(`/api/discussions/${id}/comments`).send({ isi: "Sabar itu aktif, bukan pasif." }).expect(201);
  await other.post(`/api/discussions/${id}/comments`).send({ isi: "" }).expect(400);

  const detail = await h.request(app).get(`/api/discussions/${id}`).expect(200);
  assert.equal(detail.body.comments.length, 1);
  assert.equal(detail.body.discussion.book.judul, "Buku Sabar");

  const byBook = await h.request(app).get(`/api/discussions?book=${book}`).expect(200);
  assert.equal(byBook.body.items[0].balasanCount, 1);
  assert.ok(byBook.body.items[0].cuplikan);
  assert.equal((await h.request(app).get(`/api/books/${book}`)).body.book.discussionCount, 1);

  await other.patch(`/api/discussions/${id}`).send({ judul: "Dibajak" }).expect(403);
  await user.delete(`/api/discussions/${id}/comments/${c.body.comment._id}`).expect(403);
  await admin.delete(`/api/admin/comments/${c.body.comment._id}`).expect(200);
  await user.delete(`/api/discussions/${id}`).expect(200);
});

test("admin kelola pengguna & tidak bisa menghapus admin terakhir", async () => {
  const admin = await h.makeAdmin(app);
  const user = await h.makeUser(app, "faris");
  const list = await admin.get("/api/admin/users").expect(200);
  assert.equal(list.body.total, 2);
  const faris = list.body.items.find((u) => u.username === "faris");
  const me = list.body.items.find((u) => u.username === "admin");

  await user.get("/api/admin/users").expect(403);
  await admin.patch(`/api/admin/users/${me._id}/role`).send({ role: "user" }).expect(400);
  await admin.delete(`/api/admin/users/${me._id}`).expect(400);

  await h.uploadBook(user);
  await admin.patch(`/api/admin/users/${faris._id}/role`).send({ role: "admin" }).expect(200);
  // sesi lama faris harus masuk ulang
  assert.equal((await user.get("/api/auth/me")).body.user, null);
  await admin.delete(`/api/admin/users/${faris._id}`).expect(200);
  assert.equal((await admin.get("/api/admin/books")).body.total, 0);
});

test("profil publik & ubah profil", async () => {
  const user = await h.makeUser(app, "faris");
  await user.patch("/api/users/me").field("bio", "Pecinta buku").field("instagramUrl", "javascript:alert(1)").expect(400);
  const r = await user
    .patch("/api/users/me")
    .field("bio", "Pecinta buku")
    .field("instagramUrl", "https://instagram.com/faris")
    .attach("foto", h.PNG, { filename: "f.png", contentType: "image/png" })
    .expect(200);
  assert.ok(r.body.user.fotoProfil.includes("/uploads/profil/"));
  const pub = await h.request(app).get("/api/users/faris").expect(200);
  assert.equal(pub.body.user.bio, "Pecinta buku");
  assert.equal(pub.body.user.email, undefined);
});

test("rute lama donasi sudah tidak ada", async () => {
  await h.request(app).get("/api/donasi").expect(404);
  await h.request(app).get("/api/donasi/list").expect(404);
});
