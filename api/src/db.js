const dns = require("dns");
const mongoose = require("mongoose");

mongoose.set("strictQuery", true);

// Alamat Atlas "mongodb+srv://" butuh pencarian DNS jenis SRV. DNS bawaan
// sebagian ISP / Windows menolaknya (querySrv ECONNREFUSED). Kalau terjadi,
// coba lagi memakai DNS publik Cloudflare & Google.
const SRV_ERRORS = ["ECONNREFUSED", "ETIMEOUT", "ESERVFAIL", "ENOTFOUND", "EREFUSED"];

async function connect(url, { dnsFallback = true, ...extra } = {}) {
  if (!url) throw new Error("MONGO_URL belum diisi di .env");
  const opts = { serverSelectionTimeoutMS: 15000, ...extra };
  try {
    await mongoose.connect(url, opts);
  } catch (error) {
    const srvFailed = dnsFallback && url.startsWith("mongodb+srv://") && error?.syscall === "querySrv" && SRV_ERRORS.includes(error.code);
    if (!srvFailed) throw explain(error);
    console.warn("DNS jaringan ini menolak alamat MongoDB Atlas, mencoba lewat DNS publik (1.1.1.1 / 8.8.8.8)...");
    dns.setServers(["1.1.1.1", "8.8.8.8", "1.0.0.1", "8.8.4.4"]);
    await mongoose.disconnect().catch(() => {});
    try {
      await mongoose.connect(url, opts);
    } catch (error2) {
      throw explain(error2);
    }
  }
  console.log("MongoDB tersambung.");
  return mongoose.connection;
}

// Pesan yang lebih jelas untuk kesalahan umum.
function explain(error) {
  const msg = String(error?.message || error);
  if (/bad auth|authentication failed/i.test(msg)) return new Error("Username/password MongoDB di MONGO_URL salah. Cek lagi password user database di Atlas.");
  if (/127\.0\.0\.1:27017|localhost:27017/.test(msg)) return new Error("MongoDB lokal tidak jalan. Install MongoDB atau pakai MONGO_URL dari Atlas.");
  if (/querySrv/.test(msg)) return new Error(`${msg}\nDNS jaringan memblokir alamat Atlas. Coba ganti DNS Windows ke 1.1.1.1 / 8.8.8.8, atau pakai jaringan lain (hotspot HP).`);
  if (/Server selection timed out|ReplicaSetNoPrimary|whitelist|IP/i.test(msg)) return new Error(`${msg}\nKemungkinan IP-mu belum diizinkan. Di Atlas: Database & Network Access > IP Access List > Allow Access from Anywhere.`);
  return error;
}

module.exports = { connect, mongoose };
