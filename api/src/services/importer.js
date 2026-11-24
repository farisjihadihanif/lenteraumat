// Unduh PDF dari tautan (untuk impor buku dari perpustakaan/arsip terbuka).
const dns = require("dns").promises;
const net = require("net");
const config = require("../config");
const { HttpError } = require("../middleware/errors");

let fetchImpl = (...a) => fetch(...a);
let lookupImpl = (host) => dns.lookup(host, { all: true });
function setFetch(fn) {
  fetchImpl = fn;
}
function setLookup(fn) {
  lookupImpl = fn;
}

// Tolak alamat jaringan lokal/privat supaya server tidak bisa dipakai mengintip jaringan internal.
function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivate(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

async function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || "").trim());
  } catch {
    throw new HttpError(400, "Tautan tidak valid.");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new HttpError(400, "Tautan harus diawali http:// atau https://");
  let addrs;
  try {
    addrs = net.isIP(url.hostname) ? [{ address: url.hostname }] : await lookupImpl(url.hostname);
  } catch {
    throw new HttpError(400, "Alamat situs tidak ditemukan.");
  }
  if (!addrs.length || addrs.some((a) => isPrivate(a.address))) throw new HttpError(400, "Tautan ke jaringan lokal tidak diizinkan.");
  return url;
}

async function downloadPdf(raw, { maxMb = config.maxPdfMb } = {}) {
  let url = await assertPublicUrl(raw);
  const max = maxMb * 1024 * 1024;
  let res;
  // Ikuti pengalihan secara manual supaya tiap lompatan dicek juga.
  for (let hop = 0; hop < 5; hop++) {
    try {
      res = await fetchImpl(url.href, { redirect: "manual", signal: AbortSignal.timeout(config.onVercel ? 80000 : 120000), headers: { "User-Agent": "LenteraUmat/2.0 (perpustakaan digital)" } });
    } catch {
      throw new HttpError(502, "Situs sumber tidak bisa dihubungi.");
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = await assertPublicUrl(new URL(res.headers.get("location"), url).href);
      continue;
    }
    break;
  }
  if (!res.ok) throw new HttpError(502, `Situs sumber menolak (${res.status}).`);
  const len = Number(res.headers.get("content-length") || 0);
  if (len > max) throw new HttpError(400, `PDF terlalu besar (maks ${maxMb} MB).`);
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > max) throw new HttpError(400, `PDF terlalu besar (maks ${maxMb} MB).`);
    chunks.push(Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);
  if (buffer.subarray(0, 1024).indexOf("%PDF-") === -1) throw new HttpError(400, "Tautan tidak mengarah ke file PDF. Pakai tautan unduhan PDF-nya langsung.");
  // Beberapa server menaruh byte sampah sebelum %PDF-; rapikan.
  const at = buffer.indexOf("%PDF-");
  return { buffer: at > 0 ? buffer.subarray(at) : buffer, finalUrl: url.href };
}

module.exports = { downloadPdf, assertPublicUrl, isPrivate, setFetch, setLookup };
