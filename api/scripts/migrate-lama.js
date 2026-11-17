// Pindahkan data dari database LenteraUmat versi lama ke versi perpustakaan.
// Pemakaian:  OLD_MONGO_URL="mongodb+srv://.../lenteraumat-lama" npm run migrate:lama
// Data ditulis ke MONGO_URL (database baru). Database lama hanya dibaca.
// - komunitas/donatur/user -> user, admin tetap admin (password lama tetap bisa dipakai)
// - DetilUser digabung ke profil User
// - Ebook -> Book (file tetap di Cloudinary lama, status terverifikasi -> disetujui)
// - Artikel -> Diskusi
// - Data donasi TIDAK dipindahkan.
const mongoose = require("mongoose");
const config = require("../src/config");
const User = require("../src/models/User");
const Book = require("../src/models/Book");
const Discussion = require("../src/models/Discussion");

async function migrate(oldUrl, newUrl, log = console.log) {
  const old = await mongoose.createConnection(oldUrl).asPromise();
  if (mongoose.connection.readyState !== 1) await mongoose.connect(newUrl);
  const col = (n) => old.db.collection(n);

  const detil = new Map((await col("detilusers").find().toArray()).map((d) => [String(d.detilUid), d]));
  const idMap = new Map();
  let users = 0;
  for (const u of await col("users").find().toArray()) {
    const d = detil.get(String(u._id)) || {};
    const email = String(u.email || "").toLowerCase();
    let user = await User.findOne({ email });
    if (!user) {
      let username = String(u.username || email.split("@")[0]).toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 30) || `user${users}`;
      while (await User.exists({ username })) username = `${username.slice(0, 26)}${Math.floor(Math.random() * 1000)}`;
      user = await User.create({
        username,
        email,
        password: u.password, // hash bcrypt lama tetap kompatibel
        role: u.role === "admin" ? "admin" : "user",
        namaLengkap: d.namaLengkap || u.username || "",
        fotoProfil: d.fotoProfil || "",
        bio: String(d.bio || "").slice(0, 300),
        instagramUrl: d.instagramUrl || "",
        linkedinUrl: d.linkedinUrl || "",
      });
      users++;
    }
    idMap.set(String(u._id), user._id);
  }

  const fallbackAdmin = (await User.findOne({ role: "admin" }))?._id;
  let books = 0;
  for (const e of await col("ebooks").find().toArray()) {
    if (!e.linkMateri || (await Book.exists({ "file.url": e.linkMateri }))) continue;
    const owner = idMap.get(String(e.materiUid)) || fallbackAdmin;
    if (!owner) continue;
    await Book.create({
      judul: String(e.judulMateri || "Tanpa judul").slice(0, 200),
      penulis: String(e.penulis || "Tidak diketahui").slice(0, 150),
      penerbit: e.penerbit || "",
      isbn: String(e.judulISBN || "").slice(0, 30),
      edisi: String(e.edisi || "").slice(0, 50),
      kategori: Book.CATEGORIES.find((c) => c.toLowerCase() === String(e.kategori || "").toLowerCase()) || "Umum",
      cover: e.coverMateri || "",
      file: { url: e.linkMateri, storage: "external" },
      uploadedBy: owner,
      status: e.statusMateri === "terverifikasi" ? "disetujui" : "menunggu",
      disimpan: (e.disimpan || []).map((id) => idMap.get(String(id))).filter(Boolean),
      createdAt: e.createdAt,
    });
    books++;
  }

  let discussions = 0;
  for (const a of await col("artikels").find().toArray()) {
    const author = idMap.get(String(a.artikelUid)) || fallbackAdmin;
    if (!author || !a.judulArtikel) continue;
    if (await Discussion.exists({ judul: a.judulArtikel, author })) continue;
    await Discussion.create({ judul: String(a.judulArtikel).slice(0, 200), isi: String(a.deskArtikel || "-").padEnd(10, " "), cover: a.coverUrl || "", author, createdAt: a.createdAt });
    discussions++;
  }

  await old.close();
  log(`Selesai: ${users} pengguna, ${books} buku, ${discussions} diskusi dipindahkan.`);
  return { users, books, discussions };
}

if (require.main === module) {
  const oldUrl = process.env.OLD_MONGO_URL;
  if (!oldUrl) {
    console.error("Isi OLD_MONGO_URL (database lama) dulu.");
    process.exit(1);
  }
  migrate(oldUrl, config.mongoUrl)
    .then(() => mongoose.disconnect())
    .catch((e) => {
      console.error("Migrasi gagal:", e.message);
      process.exit(1);
    });
}

module.exports = { migrate };
