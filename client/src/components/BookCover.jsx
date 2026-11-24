import { useState } from "react";

// Sampul buku. Kalau belum ada gambar, dibuat sampul tipografi dari judul.
const TONES = [
  ["#143752", "#FFC93C"],
  ["#316B6C", "#FFF1DE"],
  ["#1F4D4E", "#FFC93C"],
  ["#3E5A72", "#FFFFFF"],
  ["#7A3E12", "#FFE3B8"],
];

function tone(text = "") {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

// Sampul yang belum selesai dimuat muncul pelan di atas kotak polos (ukuran kotak tetap).
const waitForLoad = (img) => {
  if (img && !img.complete) img.dataset.cover = "wait";
};
const fadeIn = (e) => {
  if (e.currentTarget.dataset.cover) e.currentTarget.dataset.cover = "in";
};

export default function BookCover({ book, className = "", sizes = "sm", fade = false }) {
  const [failed, setFailed] = useState(false);
  const base = `relative aspect-[2/3] w-full overflow-hidden rounded-[3px_6px_6px_3px] shadow-book ${className}`;
  if (book?.cover && !failed) {
    return (
      <div className={`${base} ${fade ? "bg-line" : ""}`}>
        <img ref={fade ? waitForLoad : undefined} onLoad={fade ? fadeIn : undefined} src={book.cover} alt={`Sampul ${book.judul}`} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
        <span className="pointer-events-none absolute inset-y-0 left-0 w-2 bg-[image:var(--gradient-cover)]" />
      </div>
    );
  }
  const [bg, fg] = tone(book?.judul);
  return (
    <div className={base} style={{ background: bg, color: fg }} role="img" aria-label={`Sampul ${book?.judul || ""}`}>
      <span className="pointer-events-none absolute inset-y-0 left-0 w-2 bg-[image:var(--gradient-cover)]" />
      <div className="flex h-full flex-col justify-between p-[10%]">
        <span className="h-px w-1/3" style={{ background: fg, opacity: 0.6 }} />
        <p className={`font-serif font-semibold leading-tight ${sizes === "lg" ? "text-2xl" : "text-[13px] sm:text-sm"}`}>{book?.judul}</p>
        <p className={`opacity-90 ${sizes === "lg" ? "text-sm" : "text-[10px]"}`}>{book?.penulis}</p>
      </div>
    </div>
  );
}
