// Salin file pendukung pdf.js (dekoder gambar JPEG2000/JBIG2, font standar, cmap)
// ke public/pdfjs supaya buku hasil scan (mis. dari Internet Archive) bisa tampil.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = dirname(require.resolve("pdfjs-dist/package.json"));
const out = join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "public", "pdfjs");
mkdirSync(out, { recursive: true });
for (const dir of ["wasm", "standard_fonts", "cmaps", "iccs"]) {
  const src = join(root, dir);
  if (existsSync(src)) cpSync(src, join(out, dir), { recursive: true });
}
console.log("pdf.js assets siap di public/pdfjs");
