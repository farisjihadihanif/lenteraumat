import { useEffect, useRef, useState } from "react";
import { openBook, renderPage } from "../lib/pdf";
import { fileUrl } from "../lib/api";

// Cuplikan beberapa halaman awal buku, sebelum membuka flipbook.
export default function PdfPreview({ bookId, direct = "", pages = 4, onOpen }) {
  const box = useRef(null);
  const [state, setState] = useState({ loading: true, error: "", total: 0 });

  useEffect(() => {
    let cancelled = false;
    let doc;
    (async () => {
      try {
        doc = await openBook(fileUrl(bookId), direct);
        if (cancelled) return doc.destroy();
        const n = Math.min(pages, doc.numPages);
        setState({ loading: false, error: "", total: doc.numPages });
        for (let i = 1; i <= n && !cancelled; i++) {
          const { canvas } = await renderPage(doc, i, 260);
          if (cancelled) return;
          canvas.className = "h-auto w-full";
          const slot = box.current?.querySelector(`[data-page="${i}"]`);
          if (slot) slot.replaceChildren(canvas);
        }
      } catch {
        if (!cancelled) setState({ loading: false, error: "Cuplikan tidak bisa dimuat.", total: 0 });
      }
    })();
    return () => {
      cancelled = true;
      doc?.destroy();
    };
  }, [bookId, direct, pages]);

  if (state.error) return <p className="text-sm text-ink-mute">{state.error}</p>;
  const n = state.total ? Math.min(pages, state.total) : pages;
  return (
    <div ref={box} className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
      {Array.from({ length: n }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onOpen?.(i + 1)}
          className="w-[150px] shrink-0 snap-start text-left sm:w-[170px]"
          aria-label={`Open page ${i + 1}`}
        >
          <div data-page={i + 1} className="aspect-[1/1.41] overflow-hidden rounded border border-line bg-white shadow-sm transition-shadow hover:shadow-lift">
            <div className="h-full animate-pulse bg-mist" />
          </div>
          <span className="mt-1.5 block text-center text-xs text-ink-mute">Page {i + 1}</span>
        </button>
      ))}
    </div>
  );
}
