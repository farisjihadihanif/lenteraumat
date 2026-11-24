import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { PageFlip } from "page-flip";
import { ArrowLeft, ChevronLeft, ChevronRight, Maximize, Minimize, Sparkles } from "lucide-react";
import { api, fileUrl } from "../lib/api";
import { openBook, renderPage } from "../lib/pdf";
import { useAuth } from "../context/Auth";

const KEEP = 14; // halaman di sekitar posisi baca yang dipertahankan dalam memori

export default function Reader() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, ready } = useAuth();
  const root = useRef(null);
  const stage = useRef(null);
  const flip = useRef(null);
  const pages = useRef([]);
  const doc = useRef(null);
  const rendered = useRef(new Map());
  const saveTimer = useRef(null);

  const [book, setBook] = useState(null);
  const [status, setStatus] = useState("Membuka buku");
  const [error, setError] = useState("");
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);
  const [portrait, setPortrait] = useState(false);
  const [full, setFull] = useState(false);
  const [jump, setJump] = useState("");

  // Gambar halaman di sekitar posisi baca; hapus yang jauh supaya memori aman.
  const paint = useCallback(async (center) => {
    const d = doc.current;
    if (!d) return;
    let width = 400;
    try {
      width = Math.max(200, flip.current?.getBoundsRect()?.pageWidth || 400);
    } catch {
      /* buku belum siap */
    }
    const want = [];
    // Halaman yang sedang terlihat dulu, lalu halaman berikut/sebelumnya.
    for (const off of [0, 1, 2, -1, 3, -2, 4, 5]) {
      const i = center + off;
      if (i >= 0 && i < d.numPages) want.push(i);
    }
    for (const [i, canvas] of rendered.current) {
      if (Math.abs(i - center) > KEEP) {
        canvas.remove();
        rendered.current.delete(i);
        pages.current[i]?.classList.remove("is-ready");
      }
    }
    for (const i of want) {
      const prev = rendered.current.get(i);
      if (prev && Number(prev.dataset.w) >= width * 0.9) continue;
      rendered.current.set(i, prev || true);
      try {
        const { canvas } = await renderPage(d, i + 1, width);
        canvas.dataset.w = width;
        canvas.className = "lu-page-canvas";
        const el = pages.current[i];
        if (!el || doc.current !== d) return;
        if (prev && prev !== true) prev.remove();
        el.appendChild(canvas);
        el.classList.add("is-ready");
        rendered.current.set(i, canvas);
      } catch {
        rendered.current.delete(i);
      }
    }
  }, []);

  const saveProgress = useCallback(
    (index) => {
      if (!user) return;
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => api.put(`/books/${id}/progress`, { page: index + 1 }).catch(() => {}), 1200);
    },
    [id, user],
  );

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const host = stage.current;
    const cache = rendered.current;
    (async () => {
      try {
        const { book } = await api.get(`/books/${id}`);
        if (cancelled) return;
        setBook(book);
        document.title = `${book.judul} · LenteraUmat`;
        let start = Number(params.get("hal")) || 0;
        if (!start && user) start = (await api.get(`/books/${id}/progress`).catch(() => ({ page: 1 }))).page;
        setStatus("Menyiapkan halaman");
        const d = await openBook(fileUrl(id), book.file?.direct);
        if (cancelled) return d.destroy();
        doc.current = d;
        const first = await d.getPage(1);
        const vp = first.getViewport({ scale: 1 });
        const ratio = vp.width / vp.height;

        // Elemen buku dibuat manual: PageFlip memindahkan & menghapusnya sendiri.
        const block = document.createElement("div");
        block.className = "lu-book";
        host.appendChild(block);
        const els = [];
        for (let i = 0; i < d.numPages; i++) {
          const el = document.createElement("div");
          el.className = "lu-page";
          if (d.numPages > 3 && (i === 0 || i === d.numPages - 1)) el.dataset.density = "hard";
          const num = document.createElement("span");
          num.className = "lu-page-num";
          num.textContent = i + 1;
          el.appendChild(num);
          block.appendChild(el);
          els.push(el);
        }
        pages.current = els;
        const pf = new PageFlip(block, {
          width: 500,
          height: Math.round(500 / ratio),
          size: "stretch",
          minWidth: 260,
          maxWidth: 1400,
          minHeight: 300,
          maxHeight: 2000,
          autoSize: false,
          showCover: true,
          usePortrait: true,
          mobileScrollSupport: false,
          maxShadowOpacity: 0.45,
          flippingTime: 750,
          startPage: Math.min(Math.max(0, start - 1), d.numPages - 1),
          showPageCorners: true,
        });
        pf.loadFromHTML(els);
        flip.current = pf;
        setTotal(d.numPages);
        setCurrent(pf.getCurrentPageIndex());
        setPortrait(pf.getOrientation() === "portrait");
        pf.on("flip", (e) => {
          setCurrent(e.data);
          paint(e.data);
          saveProgress(e.data);
        });
        pf.on("changeOrientation", (e) => {
          setPortrait(e.data === "portrait");
          setTimeout(() => paint(pf.getCurrentPageIndex()), 50);
        });
        setStatus("");
        paint(pf.getCurrentPageIndex());
        api.post(`/books/${id}/read`).catch(() => {});
      } catch (e) {
        if (!cancelled) setError(e.status === 404 ? "Buku tidak ditemukan atau belum tayang." : "Buku tidak bisa dibuka. Coba muat ulang halaman.");
      }
    })();
    return () => {
      cancelled = true;
      document.title = "LenteraUmat · Digital Library";
      clearTimeout(saveTimer.current);
      try {
        flip.current?.destroy();
      } catch {
        /* sudah dibersihkan */
      }
      flip.current = null;
      host.replaceChildren();
      cache.clear();
      doc.current?.destroy();
      doc.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, ready]);

  // Ukuran halaman berubah (resize / layar penuh): gambar ulang lebih tajam.
  useEffect(() => {
    let t;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(() => flip.current && paint(flip.current.getCurrentPageIndex()), 250);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [paint]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest("input, textarea")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") flip.current?.flipNext();
      else if (e.key === "ArrowLeft" || e.key === "PageUp") flip.current?.flipPrev();
      else if (e.key === "Home") flip.current?.flip(0);
      else if (e.key === "End") flip.current?.flip(total - 1);
      else if (e.key === "Escape" && !document.fullscreenElement) navigate(`/buku/${id}`);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [id, navigate, total]);

  useEffect(() => {
    const onFs = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else root.current?.requestFullscreen?.().catch(() => {});
  };

  const goTo = (n) => {
    const i = Math.min(Math.max(1, n), total) - 1;
    if (Math.abs(i - current) <= 2) flip.current?.flip(i);
    else {
      flip.current?.turnToPage(i);
      setCurrent(i);
      paint(i);
      saveProgress(i);
    }
  };

  // Label posisi: "12–13" pada tampilan dua halaman.
  const spread = !portrait && current > 0 && current < total - 1 ? `${current + 1}–${current + 2}` : `${current + 1}`;
  const atStart = current <= 0;
  const atEnd = portrait ? current >= total - 1 : current >= total - 2 + (total % 2 === 0 ? 1 : 0);

  return (
    <div ref={root} className="lu-reader fixed inset-0 z-50 flex flex-col text-white">
      <header className="flex h-14 shrink-0 items-center gap-3 px-3 sm:px-5">
        <Link to={`/buku/${id}`} className="rounded-lg p-2 hover:bg-white/10" aria-label="Back to book details">
          <ArrowLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-sm font-semibold sm:text-base">{book?.judul || "…"}</p>
          <p className="truncate text-xs text-white/60">{book?.penulis}</p>
        </div>
        <Link to={`/luma?book=${id}`} className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-lamp hover:bg-white/10 sm:inline-flex">
          <Sparkles size={16} /> Ask LUMA
        </Link>
        <button onClick={toggleFull} className="rounded-lg p-2 hover:bg-white/10" aria-label={full ? "Exit full screen" : "Full screen"}>
          {full ? <Minimize size={20} /> : <Maximize size={20} />}
        </button>
      </header>

      <div className="relative min-h-0 flex-1 px-2 sm:px-14">
        <div ref={stage} className="h-full w-full" />
        {(status || error) && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            {error ? (
              <div>
                <p className="text-white/90">{error}</p>
                <Link to={`/buku/${id}`} className="btn-primary mt-4">
                  Back
                </Link>
              </div>
            ) : (
              <p className="flex items-center gap-3 text-white/70">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-lamp border-t-transparent" /> {status}…
              </p>
            )}
          </div>
        )}
        {!status && !error && (
          <>
            <button onClick={() => flip.current?.flipPrev()} disabled={atStart} className="lu-nav left-1 sm:left-3" aria-label="Previous page">
              <ChevronLeft size={26} />
            </button>
            <button onClick={() => flip.current?.flipNext()} disabled={atEnd} className="lu-nav right-1 sm:right-3" aria-label="Next page">
              <ChevronRight size={26} />
            </button>
          </>
        )}
      </div>

      <footer className="flex shrink-0 items-center gap-4 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 sm:px-6">
        <input
          type="range"
          min={1}
          max={Math.max(1, total)}
          value={current + 1}
          onChange={(e) => goTo(Number(e.target.value))}
          className="lu-range flex-1"
          aria-label="Slide to page"
          disabled={!total}
        />
        <form
          className="flex shrink-0 items-center gap-1.5 text-sm text-white/80"
          onSubmit={(e) => {
            e.preventDefault();
            if (jump) goTo(Number(jump));
            setJump("");
          }}
        >
          <span className="hidden sm:inline">Page</span>
          <input
            inputMode="numeric"
            value={jump}
            onChange={(e) => setJump(e.target.value.replace(/\D/g, ""))}
            placeholder={spread}
            className="w-16 rounded-md bg-white/10 px-2 py-1 text-center text-white placeholder:text-white focus:bg-white/20 focus:outline-none"
            aria-label="Jump to page"
          />
          <span>/ {total || "–"}</span>
        </form>
      </footer>
    </div>
  );
}
