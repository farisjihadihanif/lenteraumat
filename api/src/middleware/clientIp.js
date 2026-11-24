// IP asli pengunjung untuk batas percobaan (rate limit).
const net = require("net");
const config = require("../config");

// Di Vercel, x-real-ip berisi IP pengunjung, juga setelah rewrite web -> API. Edge Vercel
// yang menulisnya, bukan browser. Disalin ke x-forwarded-for supaya req.ip membacanya;
// kalau tidak ada, "trust proxy" 1 memakai entri paling kanan (yang kiri bisa dipalsukan).
// Di luar Vercel header x-real-ip tidak dipercaya.
function clientIp(req, res, next) {
  const real = String(req.headers["x-real-ip"] || "").trim();
  if (config.onVercel && net.isIP(real)) req.headers["x-forwarded-for"] = real;
  next();
}

// IPv6: satu pelanggan menguasai satu blok /64, jadi kuncinya 4 kelompok pertama.
function ipKey(req) {
  const ip = String(req.ip || "").replace(/^::ffff:(?=\d+\.)/i, "");
  if (net.isIP(ip) !== 6) return ip;
  const [head, tail] = ip.split("%")[0].split("::");
  const groups = head ? head.split(":") : [];
  if (tail !== undefined) {
    const end = tail ? tail.split(":") : [];
    while (groups.length + end.length < 8) groups.push("0");
    groups.push(...end);
  }
  return groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(":");
}

module.exports = { clientIp, ipKey };
