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

export async function openPdf(src) {
  const { getDocument } = await pdfjs();
  // Untuk buku dari tautan: ambil per bagian (range) saja, bukan seluruh file.
  return getDocument(
    typeof src === "string" ? { ...SUPPORT, url: src, withCredentials: true, disableAutoFetch: true, disableStream: true, rangeChunkSize: 256 * 1024 }
      : { ...SUPPORT, data: src },
  ).promise;
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
export async function coverFromPdf(file) {
  const doc = await openPdf(new Uint8Array(await file.arrayBuffer()));
  const { canvas } = await renderPage(doc, 1, 600);
  await doc.destroy();
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b && new File([b], "sampul.jpg", { type: "image/jpeg" })), "image/jpeg", 0.85));
}
