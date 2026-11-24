import { useEffect, useLayoutEffect, useState } from "react";
import { useLocation, useNavigationType, useSearchParams } from "react-router-dom";
import { Search, X } from "lucide-react";
import { api } from "../lib/api";
import { useCategories } from "../lib/categories";
import BookGrid from "../components/BookGrid";
import { Empty, ErrorBox, Pagination, Spinner } from "../components/ui";

const SORTS = [
  ["terbaru", "Terbaru"],
  ["populer", "Paling banyak dibaca"],
  ["rating", "Rating tertinggi"],
  ["judul", "Judul A–Z"],
];

// Hasil & posisi gulir tiap kunjungan (per entri riwayat), dipakai saat kembali dari detail buku.
const visits = new Map();

export default function Catalog() {
  const { key } = useLocation();
  const saved = useNavigationType() === "POP" ? visits.get(key) : undefined;
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const kategori = params.get("kategori") || "";
  const sort = params.get("sort") || "terbaru";
  const page = Number(params.get("page")) || 1;
  const [input, setInput] = useState(q);
  const categories = useCategories();
  const [res, setRes] = useState(saved?.res || null);
  const [error, setError] = useState("");

  useEffect(() => {
    setInput(q);
  }, [q]);
  useEffect(() => {
    const ctrl = new AbortController();
    setRes(visits.get(key)?.res || null);
    setError("");
    const qs = new URLSearchParams({ q, kategori, sort, page, limit: 24 });
    api
      .get(`/books?${qs}`, { signal: ctrl.signal })
      .then((r) => {
        visits.set(key, { y: 0, ...visits.get(key), res: r });
        setRes(r);
      })
      .catch((e) => e.name !== "AbortError" && setError(e.message));
    return () => ctrl.abort();
  }, [q, kategori, sort, page, key]);

  useLayoutEffect(() => {
    const y = saved?.y;
    // Setelah Layout menggulir ke atas.
    const raf = y ? requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "instant" })) : 0;
    const onScroll = () => visits.set(key, { ...visits.get(key), y: window.scrollY });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    if (!("page" in patch)) next.delete("page");
    setParams(next);
  };

  return (
    <div className="container-page py-8">
      <h1 className="font-serif text-3xl font-semibold">Library</h1>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <form
          role="search"
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: input.trim() });
          }}
        >
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
          <input className="field pl-9" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Cari judul, penulis, penerbit, atau ISBN" aria-label="Cari buku" />
        </form>
        <select className="field sm:w-56" value={kategori} onChange={(e) => update({ kategori: e.target.value })} aria-label="Kategori">
          <option value="">Semua kategori</option>
          {categories.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="field sm:w-56" value={sort} onChange={(e) => update({ sort: e.target.value === "terbaru" ? "" : e.target.value })} aria-label="Urutkan">
          {SORTS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {q && (
        <p className="mt-5 flex items-center gap-2 text-sm text-ink-soft">
          Hasil pencarian “{q}”
          <button onClick={() => update({ q: "" })} className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-ink-mute hover:text-ink">
            <X size={12} /> hapus
          </button>
        </p>
      )}

      <div className="mt-8">
        <ErrorBox>{error}</ErrorBox>
        {!res && !error && <Spinner />}
        {res &&
          (res.items.length ? (
            <>
              <p className="mb-6 text-sm text-ink-mute">{res.total} buku</p>
              <BookGrid books={res.items} linkState={{ dariLibrary: true }} reveal="rise" />
              <Pagination page={res.page} pages={res.pages} onChange={(p) => update({ page: String(p) })} />
            </>
          ) : (
            <Empty title="Buku tidak ditemukan">Coba kata kunci lain atau pilih kategori yang berbeda.</Empty>
          ))}
      </div>
    </div>
  );
}
