// pdf.js dimuat hanya saat dibutuhkan (preview, flipbook, sampul otomatis).
let lib = null;
export async function pdfjs() {
  if (!lib) {
    const [mod, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
    mod.GlobalWorkerOptions.workerSrc = worker.default;
    lib = mod;
  }
  return lib;
}

// File pendukung pdf.js (disalin ke public/pdfjs saat npm run dev / build).
const ASSETS = `${import.meta.env.BASE_URL}pdfjs/`;
const SUPPORT = {
  wasmUrl: `${ASSETS}wasm/`,
  standardFontDataUrl: `${ASSETS}standard_fonts/`,
  cMapUrl: `${ASSETS}cmaps/`,
  cMapPacked: true,
  iccUrl: `${ASSETS}iccs/`,
};

const CHUNK = 512 * 1024;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const options = () => ({ ...SUPPORT, rangeChunkSize: CHUNK, disableStream: true, disableAutoFetch: true });

export async function openPdf(data) {
  const { getDocument } = await pdfjs();
  return getDocument({ ...options(), data }).promise;
}

// Satu potongan [begin, end). Hasil: { data, total }, atau { data, whole: true } bila server
// (bukan Vercel) membalas file utuh.
async function fetchPart(source, begin, end, signal) {
  // Rentang ikut di alamat supaya tidak ada cache yang menukar potongan.
  const url = source.direct ? source.url : `${source.url}?r=${begin}-${end - 1}`;
  const res = await fetch(url, { headers: { Range: `bytes=${begin}-${end - 1}` }, credentials: source.direct ? "omit" : "include", signal });
  if (res.status === 200 && !source.direct) return { data: new Uint8Array(await res.arrayBuffer()), whole: true };
  const cr = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(res.headers.get("content-range") || "");
  if (res.status !== 206 || !cr || Number(cr[1]) !== begin) {
    res.body?.cancel().catch(() => {});
    throw Object.assign(new Error(`Potongan buku gagal (${res.status}).`), { status: res.status });
  }
  const data = new Uint8Array(await res.arrayBuffer());
  if (!data.length || data.length !== Number(cr[2]) - begin + 1) throw new Error("Potongan buku tidak lengkap.");
  return { data, total: Number(cr[3]) };
}

// Buku dibuka per potongan 512 KB, tidak pernah meminta file utuh. `direct`: alamat yang boleh diambil
// langsung (Cloudinary); kalau gagal, pindah ke proxy `url`.
export async function openBook(url, direct = "") {
  const { getDocument, PDFDataRangeTransport } = await pdfjs();
  const ctrl = new AbortController();
  const proxy = { url };
  let source = direct ? { url: direct, direct: true } : proxy;
  let opened = false;

  async function part(begin, end) {
    for (let n = 0; ; n++) {
      try {
        return await fetchPart(source, begin, end, ctrl.signal);
      } catch (error) {
        if (ctrl.signal.aborted) throw error;
        if (source.direct) {
          source = proxy;
          continue;
        }
        // Saat membuka: beberapa kali saja. Setelah terbuka, tunggu sampai sambungan pulih,
        // karena pdf.js tidak punya cara meminta ulang potongan yang gagal.
        if (!opened && (n >= 3 || [401, 403, 404].includes(error.status))) throw error;
        await wait(Math.min(15000, 600 * 2 ** n));
      }
    }
  }

  const first = await part(0, CHUNK);
  if (first.whole || first.data.length >= first.total) return openPdf(first.data);
  const { total } = first;

  class Transport extends PDFDataRangeTransport {
    async requestDataRange(begin, end) {
      try {
        const out = new Uint8Array(end - begin);
        for (let pos = begin; pos < end; ) {
          const r = await part(pos, Math.min(pos + CHUNK, end));
          if (r.whole) {
            out.set(r.data.subarray(pos, end), pos - begin);
            break;
          }
          if (r.total !== total) throw new Error("File buku berubah saat dibaca.");
          out.set(r.data, pos - begin);
          pos += r.data.length;
        }
        this.onDataRange(begin, out);
      } catch (error) {
        if (!ctrl.signal.aborted) fail(error);
      }
    }
    abort() {
      ctrl.abort();
    }
  }

  let fail;
  const failed = new Promise((_, reject) => (fail = reject));
  failed.catch(() => {});
  const task = getDocument({ ...options(), range: new Transport(total, first.data) });
  try {
    const doc = await Promise.race([task.promise, failed]);
    opened = true;
    return doc;
  } catch (error) {
    ctrl.abort();
    task.destroy().catch(() => {});
    throw error;
  }
}

// Render satu halaman ke canvas dengan lebar tertentu (px CSS).
export async function renderPage(doc, number, width, canvas = document.createElement("canvas")) {
  const page = await doc.getPage(number);
  const base = page.getViewport({ scale: 1 });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale: (width / base.width) * dpr });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  page.cleanup();
  return { canvas, ratio: base.height / base.width };
}

// Sampul otomatis dari halaman pertama PDF (untuk buku tanpa gambar sampul).
// src: File pilihan user, atau alamat file buku (cukup halaman pertamanya yang diambil).
export async function coverFromPdf(src) {
  const doc = typeof src === "string" ? await openBook(src) : await openPdf(new Uint8Array(await src.arrayBuffer()));
  const { canvas } = await renderPage(doc, 1, 600);
  await doc.destroy();
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b && new File([b], "sampul.jpg", { type: "image/jpeg" })), "image/jpeg", 0.85));
}
