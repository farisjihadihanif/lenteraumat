// Potongan file buku untuk Vercel: tiap balasan kecil (batas respons fungsi 4,5 MB), tidak pernah
// meneruskan file utuh. Sumber yang tidak mendukung Range (banyak OJS) diambil utuh sekali lalu dipotong di sini.
const fs = require("fs");
const storage = require("./storage");
const { HttpError } = require("../middleware/errors");

const MAX_CHUNK = 2 * 1024 * 1024;
const MAX_WHOLE = 60 * 1024 * 1024;
const WHOLE_TTL = 10 * 60 * 1000;

const bukanPdf = () => new HttpError(502, "Sumber buku sedang tidak mengirimkan file PDF. Coba lagi nanti.");
const terlaluBesar = () => new HttpError(502, "File buku terlalu besar untuk dibuka lewat server ini.");
const isPdf = (buf) => buf.subarray(0, 1024).indexOf("%PDF-") !== -1;
const buang = (res) => res?.body?.cancel().catch(() => {});

// "bytes=a-b" | "bytes=a-" | "bytes=-n" -> { start, end } atau { suffix }. null = bukan satu rentang yang sah.
function parseRange(header) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header || "");
  if (!m || (!m[1] && !m[2])) return null;
  if (!m[1]) return { suffix: Number(m[2]) };
  const start = Number(m[1]);
  const end = m[2] ? Number(m[2]) : Infinity;
  return end < start ? null : { start, end };
}

async function readUpTo(res, limit) {
  const parts = [];
  let size = 0;
  for await (const part of res.body) {
    size += part.length;
    if (size > limit) throw terlaluBesar();
    parts.push(part);
  }
  return Buffer.concat(parts);
}

// File utuh dari sumber tanpa Range, disimpan sebentar; potongan yang diminta bersamaan berbagi satu unduhan.
const whole = new Map();
function cachedWhole(url) {
  const hit = whole.get(url);
  return hit && hit.until > Date.now() ? hit.promise : null;
}

function wholeFile(stored, res, done) {
  const hit = cachedWhole(stored.url);
  if (hit) {
    buang(res);
    done();
    return hit;
  }
  const entry = { until: Date.now() + WHOLE_TTL, size: 0 };
  entry.promise = (async () => {
    try {
      if (Number(res.headers.get("content-length")) > MAX_WHOLE) {
        buang(res);
        throw terlaluBesar();
      }
      const buf = await readUpTo(res, MAX_WHOLE);
      if (!isPdf(buf)) throw bukanPdf();
      entry.size = buf.length;
      // Total simpanan dibatasi; yang paling lama dibuang dulu.
      let total = 0;
      for (const [url, e] of [...whole].reverse()) {
        total += e.size;
        if (total > MAX_WHOLE && e !== entry) whole.delete(url);
      }
      return buf;
    } finally {
      done();
    }
  })();
  entry.promise.catch(() => whole.get(stored.url) === entry && whole.delete(stored.url));
  whole.delete(stored.url);
  whole.set(stored.url, entry);
  return entry.promise;
}

function slice(buf, start, end) {
  if (start >= buf.length) return { total: buf.length };
  return { start, total: buf.length, body: buf.subarray(start, Math.min(end + 1, buf.length)) };
}

async function readLocal(file, range) {
  const fd = await fs.promises.open(file).catch(() => {
    throw new HttpError(404, "File buku tidak ditemukan di server.");
  });
  try {
    const total = (await fd.stat()).size;
    const start = range.suffix === undefined ? range.start : Math.max(0, total - range.suffix);
    if (start >= total) return { total };
    const body = Buffer.alloc(Math.min(range.end ?? Infinity, start + MAX_CHUNK - 1, total - 1) - start + 1);
    await fd.read(body, 0, body.length, start);
    return { start, total, body };
  } finally {
    await fd.close();
  }
}

// -> { start, total, body } atau { total } bila di luar file (416).
async function readRange(stored, range) {
  const local = storage.localPath(stored);
  if (local) return readLocal(local, range);
  if (range.suffix !== undefined) {
    const { total } = await readRange(stored, { start: 0, end: 0 });
    if (!range.suffix || !total) return { total };
    return readRange(stored, { start: Math.max(0, total - range.suffix), end: total - 1 });
  }
  const { start } = range;
  const end = Math.min(range.end, start + MAX_CHUNK - 1);
  const hit = cachedWhole(stored.url);
  if (hit) return slice(await hit, start, end);

  let last;
  for (let i = 0; i < 2; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 50 * 1000);
    const done = () => clearTimeout(timer);
    try {
      const res = await storage.open(stored, { range: `bytes=${start}-${end}`, signal: ctrl.signal });
      const cr = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(res.headers.get("content-range") || "");
      if (res.status === 416) {
        buang(res);
        done();
        return { total: Number(/\/(\d+)$/.exec(res.headers.get("content-range") || "")?.[1]) || 0 };
      }
      // Batas waktu tetap berlaku sampai unduhan utuhnya selesai.
      if (res.status === 200) return slice(await wholeFile(stored, res, done), start, end);
      if (res.status !== 206 || !cr || Number(cr[1]) !== start || Number(cr[2]) > end) {
        buang(res);
        throw new Error("Balasan Range tidak sah.");
      }
      const body = await readUpTo(res, MAX_CHUNK);
      if (body.length !== Number(cr[2]) - start + 1) throw new Error("Potongan tidak lengkap.");
      if (start === 0 && body.length >= 1024 && !isPdf(body)) throw bukanPdf();
      done();
      return { start, total: Number(cr[3]), body };
    } catch (error) {
      done();
      if (error instanceof HttpError) throw error;
      last = error;
    }
  }
  console.error("Potongan buku gagal:", stored.url, last?.cause?.code || last?.message);
  throw new HttpError(502, storage.PUTUS);
}

module.exports = { parseRange, readRange, MAX_CHUNK };
