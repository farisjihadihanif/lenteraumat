import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Pencil, Upload } from "lucide-react";
import { api } from "../lib/api";
import BookGrid from "../components/BookGrid";
import BookCover from "../components/BookCover";
import { Empty, Spinner, StatusBadge } from "../components/ui";
import { timeAgo } from "../lib/format";

const TABS = [
  ["baca", "Lanjut membaca"],
  ["simpan", "Disimpan"],
  ["unggahan", "Unggahanku"],
];

export default function Shelf() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([t]) => t === params.get("tab")) ? params.get("tab") : "baca";
  const [items, setItems] = useState(null);

  useEffect(() => {
    setItems(null);
    const path = { baca: "/books/continue", simpan: "/books/saved", unggahan: "/books/mine" }[tab];
    api.get(path).then((r) => setItems(r.items)).catch(() => setItems([]));
  }, [tab]);

  return (
    <div className="container-page py-8">
      <h1 className="font-serif text-3xl font-semibold">Rak saya</h1>
      <div className="mt-5 flex gap-1 border-b border-line" role="tablist">
        {TABS.map(([t, l]) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setParams({ tab: t })} className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold ${tab === t ? "border-lantern text-ink" : "border-transparent text-ink-mute hover:text-ink"}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {!items && <Spinner />}
        {items && tab === "baca" &&
          (items.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map(({ book, page, totalPages, updatedAt }) => (
                <Link key={book._id} to={`/buku/${book._id}/baca`} className="panel flex gap-4 p-3 hover:border-teal/40">
                  <div className="w-16 shrink-0"><BookCover book={book} /></div>
                  <div className="min-w-0 flex-1 py-1">
                    <p className="book-title line-clamp-2 text-sm">{book.judul}</p>
                    <p className="mt-1 text-xs text-ink-mute">Halaman {page}{totalPages ? ` dari ${totalPages}` : ""} · {timeAgo(updatedAt)}</p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-mist">
                      <div className="h-full rounded-full bg-lantern" style={{ width: `${totalPages ? Math.min(100, (page / totalPages) * 100) : 5}%` }} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <Empty title="Belum ada buku yang dibaca" action={<Link to="/buku" className="btn-primary">Buka Library</Link>}>Buku yang kamu buka akan muncul di sini beserta halaman terakhirnya.</Empty>
          ))}

        {items && tab === "simpan" &&
          (items.length ? <BookGrid books={items} /> : <Empty title="Belum ada buku tersimpan">Tekan tombol Simpan di halaman buku untuk menaruhnya di rakmu.</Empty>)}

        {items && tab === "unggahan" &&
          (items.length ? (
            <ul className="space-y-3">
              {items.map((b) => (
                <li key={b._id} className="panel flex gap-4 p-3 sm:p-4">
                  <Link to={`/buku/${b._id}`} className="w-14 shrink-0 sm:w-16"><BookCover book={b} /></Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/buku/${b._id}`} className="book-title truncate hover:text-teal">{b.judul}</Link>
                      <StatusBadge status={b.status} />
                    </div>
                    <p className="text-xs text-ink-mute">{b.penulis} · diperbarui {timeAgo(b.updatedAt)}</p>
                    {b.catatanReview && b.status !== "disetujui" && <p className="mt-2 rounded-lg bg-mist px-3 py-2 text-sm">Catatan admin: {b.catatanReview}</p>}
                    {(b.status === "revisi" || b.status === "ditolak" || b.status === "menunggu") && (
                      <Link to={`/buku/${b._id}/ubah`} className="btn-outline btn-sm mt-3">
                        <Pencil size={14} /> {b.status === "menunggu" ? "Ubah" : "Perbaiki & ajukan ulang"}
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="Kamu belum mengunggah buku" action={<Link to="/unggah" className="btn-primary"><Upload size={16} /> Unggah buku</Link>}>Buku yang kamu unggah akan ditinjau admin sebelum tayang.</Empty>
          ))}
      </div>
    </div>
  );
}
