const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const bcrypt = require("bcryptjs");

let app, oldDb;
before(async () => {
  app = await h.start();
  oldDb = await MongoMemoryServer.create();
});
after(async () => {
  await oldDb.stop();
  await h.stop();
});

test("migrasi dari database lama", async () => {
  const conn = await mongoose.createConnection(oldDb.getUri()).asPromise();
  const hash = await bcrypt.hash("passwordlama", 10);
  const { insertedId: kom } = await conn.db.collection("users").insertOne({ username: "Komunitas A", email: "kom@a.id", password: hash, role: "komunitas" });
  await conn.db.collection("users").insertOne({ username: "boss", email: "boss@a.id", password: hash, role: "admin" });
  await conn.db.collection("detilusers").insertOne({ detilUid: kom, namaLengkap: "Komunitas Aksara", bio: "Halo" });
  await conn.db.collection("ebooks").insertOne({ materiUid: kom, judulMateri: "Fikih Wanita", penulis: "X", kategori: "fikih", linkMateri: "https://res.cloudinary.com/x/raw/upload/a.pdf", statusMateri: "terverifikasi" });
  await conn.db.collection("artikels").insertOne({ artikelUid: kom, judulArtikel: "Kabar komunitas", deskArtikel: "Isi artikel lama yang panjang" });
  await conn.db.collection("donasis").insertOne({ x: 1 });
  await conn.close();

  const { migrate } = require("../scripts/migrate-lama");
  const r = await migrate(oldDb.getUri(), "", () => {});
  assert.deepEqual(r, { users: 2, books: 1, discussions: 1 });
  // idempoten
  assert.deepEqual(await migrate(oldDb.getUri(), "", () => {}), { users: 0, books: 0, discussions: 0 });

  const login = await h.request(app).post("/api/auth/login").send({ identifier: "kom@a.id", password: "passwordlama" }).expect(200);
  assert.equal(login.body.user.role, "user");
  assert.equal(login.body.user.namaLengkap, "Komunitas Aksara");
  const books = await h.request(app).get("/api/books").expect(200);
  assert.equal(books.body.items[0].kategori, "Fikih");
});
