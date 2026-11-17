// Dijalankan di worker thread: membaca PDF (jumlah halaman / teks) terpisah dari
// server utama, supaya PDF yang aneh tidak bisa membuat server mati.
const { parentPort } = require("worker_threads");
const path = require("path");

const FONTS = path.join(require.resolve("pdfjs-dist/package.json"), "..", "standard_fonts") + path.sep;
const MAX_CHARS = 400000;

// Diam-kan peringatan polyfill pdf.js (DOMMatrix dll.) yang tidak relevan untuk ekstraksi teks.
const warn = console.warn;
console.warn = (...a) => (/polyfill|Warning: /i.test(String(a[0])) ? undefined : warn(...a));
const pdfjs = import("pdfjs-dist/legacy/build/pdf.mjs");

async function open(data) {
  const { getDocument } = await pdfjs;
  return getDocument({ data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, standardFontDataUrl: FONTS, verbosity: 0 }).promise;
}

parentPort.on("message", async ({ id, task, data }) => {
  let doc;
  try {
    doc = await open(new Uint8Array(data));
    if (task === "count") {
      parentPort.postMessage({ id, result: doc.numPages });
    } else {
      let text = "";
      for (let i = 1; i <= doc.numPages && text.length < MAX_CHARS; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        text += `\n[Halaman ${i}]\n` + content.items.map((it) => it.str).join(" ").replace(/\s+/g, " ").trim();
        page.cleanup();
      }
      parentPort.postMessage({ id, result: { text: text.slice(0, MAX_CHARS).trim(), pages: doc.numPages } });
    }
  } catch (error) {
    parentPort.postMessage({ id, error: error?.message || String(error) });
  } finally {
    await doc?.destroy().catch(() => {});
  }
});
