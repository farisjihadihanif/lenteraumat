// Ekstraksi teks PDF di server (sekali per buku), hasilnya disimpan di BookText.
let pdfjsPromise = null;
function pdfjs() {
  pdfjsPromise ||= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsPromise;
}

const MAX_CHARS = 400000;

async function extractText(buffer) {
  const { getDocument } = await pdfjs();
  const doc = await getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, disableFontFace: true, useSystemFonts: false })
    .promise;
  let text = "";
  for (let i = 1; i <= doc.numPages && text.length < MAX_CHARS; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += `\n[Halaman ${i}]\n` + content.items.map((it) => it.str).join(" ").replace(/\s+/g, " ").trim();
    page.cleanup();
  }
  const pages = doc.numPages;
  await doc.destroy();
  return { text: text.slice(0, MAX_CHARS).trim(), pages };
}

async function countPages(buffer) {
  const { getDocument } = await pdfjs();
  const doc = await getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise;
  const n = doc.numPages;
  await doc.destroy();
  return n;
}

module.exports = { extractText, countPages };
