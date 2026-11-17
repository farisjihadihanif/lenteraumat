const bcrypt = require("bcryptjs");
const config = require("./config");
const User = require("./models/User");

// Buat akun admin pertama dari .env (ADMIN_EMAIL + ADMIN_PASSWORD) bila belum ada admin.
async function ensureAdmin() {
  if (await User.exists({ role: "admin" })) return null;
  if (!config.adminEmail || !config.adminPassword) {
    console.warn("Belum ada admin. Isi ADMIN_EMAIL dan ADMIN_PASSWORD di .env lalu jalankan ulang server.");
    return null;
  }
  const email = config.adminEmail.toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) {
    existing.role = "admin";
    await existing.save();
    console.log(`Akun ${email} dijadikan admin.`);
    return existing;
  }
  const admin = await User.create({
    username: config.adminUsername.toLowerCase(),
    email,
    namaLengkap: "Admin LenteraUmat",
    password: await bcrypt.hash(config.adminPassword, 10),
    role: "admin",
  });
  console.log(`Admin dibuat: ${email}`);
  return admin;
}

module.exports = { ensureAdmin };
