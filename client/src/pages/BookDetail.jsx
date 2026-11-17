import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { Bookmark, BookmarkCheck, BookOpen, Pencil, Share2, Sparkles, Trash2, MessagesSquare } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/Auth";
import BookCover from "../components/BookCover";
import PdfPreview from "../components/PdfPreview";
import ReportButton from "../components/ReportButton";
import { Avatar, ConfirmModal, Empty, ErrorBox, PageLoader, Pagination, StarInput, Stars, StatusBadge, UserLink } from "../components/ui";
import { displayName, formatDate, formatSize, timeAgo } from "../lib/format";

function Reviews({ book, onRating }) {
  const { user, isAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({ rating: 0, komentar: "" });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [del, setDel] = useState(null);

  const load = useCallback(() => {
    api.get(`/books/${book._id}/reviews?page=${page}`).then((d) => {
      setData(d);
      if (d.mine) setForm({ rating: d.mine.rating, komentar: d.mine.komentar });
    });
  }, [book._id, page]);
  useEffect(load, [load]);

  const isUploader = user && book.uploadedBy?._id === user._id && !isAdmin;
  const canWrite = user && book.status === "disetujui" && !isUploader;

  const submit = async (e) => {
    e.preventDefault();
    if (!form.rating) return setError("Pilih jumlah bintang dulu.");
    setBusy(true);
    setError("");
    try {
      const r = await api.put(`/books/${book._id}/reviews`, form);
      onRating(r.ratingAvg, r.ratingCount);
      setEditing(false);
      toast.success("Ulasan tersimpan.");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.del(isAdmin && del.user?._id !== user._id ? `/admin/reviews/${del._id}` : `/reviews/${del._id}`);
      toast.success("Ulasan dihapus.");
      setDel(null);
      if (del._id === data.mine?._id) setForm({ rating: 0, komentar: "" });
      const b = await api.get(`/books/${book._id}`);
      onRating(b.book.ratingAvg, b.book.ratingCount);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) return null;
  const showForm = canWrite && (!data.mine || editing);
  return (
    <section className="mt-12" aria-labelledby="ulasan">
      <h2 id="ulasan" className="text-xl font-bold">
        Ulasan pembaca
      </h2>
      <div className="mt-5 grid gap-8 md:grid-cols-[220px_1fr]">
        <div>
          <p className="font-serif text-5xl font-semibold">{data.count ? data.avg.toFixed(1) : "–"}</p>
          <Stars value={data.avg} size={18} className="mt-1" />
          <p className="mt-1 text-sm text-ink-mute">{data.count} ulasan</p>
          <div className="mt-4 space-y-1.5">
            {data.distribution.map((d) => (
              <div key={d.star} className="flex items-center gap-2 text-xs text-ink-mute">
                <span className="w-3">{d.star}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-line/60">
                  <div className="h-full rounded-full bg-lamp" style={{ width: `${data.count ? (d.count / data.count) * 100 : 0}%` }} />
                </div>
                <span className="w-6 text-right">{d.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          {!user && (
            <p className="mb-6 rounded-lg bg-surface p-4 text-sm text-ink-soft">
              <Link to={`/masuk?next=/buku/${book._id}`} className="font-semibold text-teal hover:underline">
                Masuk
              </Link>{" "}
              untuk memberi rating dan ulasan.
            </p>
          )}
          {isUploader && <p className="mb-6 text-sm text-ink-mute">Kamu pengunggah buku ini, jadi tidak bisa mengulasnya.</p>}

          {showForm && (
            <form onSubmit={submit} className="panel mb-6 space-y-3 p-4">
              <p className="text-sm font-semibold">{data.mine ? "Ubah ulasanmu" : "Bagaimana menurutmu buku ini?"}</p>
              <StarInput value={form.rating} onChange={(rating) => setForm((f) => ({ ...f, rating }))} />
              <textarea className="field min-h-[90px]" maxLength={2000} placeholder="Ceritakan apa yang kamu dapat dari buku ini (opsional)" value={form.komentar} onChange={(e) => setForm((f) => ({ ...f, komentar: e.target.value }))} />
              <ErrorBox>{error}</ErrorBox>
              <div className="flex gap-2">
                <button className="btn-primary" disabled={busy}>
                  {busy ? "Menyimpan…" : "Kirim ulasan"}
                </button>
                {editing && (
                  <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>
                    Batal
                  </button>
                )}
              </div>
            </form>
          )}

          {data.items.length === 0 ? (
            <Empty title="Belum ada ulasan">Sudah membaca buku ini? Tulis ulasan pertama.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {data.items.map((r) => {
                const mine = r._id === data.mine?._id;
                return (
                  <li key={r._id} className="flex gap-3 py-4">
                    <Avatar user={r.user} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 text-sm">
                        <UserLink user={r.user} />
                        <span className="text-xs text-ink-mute">{timeAgo(r.updatedAt)}</span>
                      </div>
                      <Stars value={r.rating} size={13} className="mt-0.5" />
                      {r.komentar && <p className="mt-1.5 whitespace-pre-line text-sm text-ink-soft">{r.komentar}</p>}
                      <div className="mt-2 flex gap-3 text-xs font-semibold">
                        {!mine && <ReportButton type="review" id={r._id} ownerId={r.user?._id} className="font-normal" />}
                      {(mine || isAdmin) && (
                        <>
                          {mine && (
                            <button className="text-teal hover:underline" onClick={() => setEditing(true)}>
                              Ubah
                            </button>
                          )}
                          <button className="text-danger hover:underline" onClick={() => setDel(r)}>
                            Hapus
                          </button>
                        </>
                      )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <Pagination page={data.page} pages={data.pages} onChange={setPage} />
        </div>
      </div>
      <ConfirmModal open={Boolean(del)} title="Hapus ulasan?" message="Ulasan dan ratingnya akan dihapus." busy={busy} onConfirm={remove} onClose={() => setDel(null)} />
    </section>
  );
}

function BookDiscussions({ book }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    api.get(`/discussions?book=${book._id}&limit=5&sort=aktif`).then((r) => setItems(r.items)).catch(() => setItems([]));
  }, [book._id]);
  if (!items) return null;
  return (
    <section className="mt-12">
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-xl font-bold">Diskusi tentang buku ini</h2>
        <Link to={`/diskusi/baru?book=${book._id}`} className="btn-outline btn-sm">
          <MessagesSquare size={14} /> Mulai diskusi
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-ink-mute">Belum ada diskusi. Punya pertanyaan atau catatan tentang buku ini? Ajak pembaca lain berdiskusi.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((d) => (
            <li key={d._id}>
              <Link to={`/diskusi/${d._id}`} className="panel block p-4 hover:border-teal/40">
                <p className="font-bold">{d.judul}</p>
                <p className="mt-1 text-xs text-ink-mute">
                  {displayName(d.author)} · {timeAgo(d.lastActivityAt)} · {d.balasanCount} balasan
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function BookDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [book, setBook] = useState(null);
  const [error, setError] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setBook(null);
    api
      .get(`/books/${id}`)
      .then((r) => setBook(r.book))
      .catch((e) => setError(e.message));
  }, [id, user?._id]);

  if (error) return <div className="container-page py-16"><Empty title="Buku tidak ditemukan">{error}</Empty></div>;
  if (!book) return <PageLoader />;

  const toggleSave = async () => {
    if (!user) return navigate(`/masuk?next=/buku/${id}`);
    const r = await api.post(`/books/${id}/save`).catch((e) => toast.error(e.message));
    if (r) {
      setBook((b) => ({ ...b, saved: r.saved, savedCount: b.savedCount + (r.saved ? 1 : -1) }));
      toast.success(r.saved ? "Disimpan ke rak." : "Dihapus dari rak.");
    }
  };
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: book.judul, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Tautan disalin.");
      }
    } catch {
      /* dibatalkan */
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api.del(`/books/${id}`);
      toast.success("Buku dihapus.");
      navigate("/rak?tab=unggahan");
    } catch (e) {
      toast.error(e.message);
      setBusy(false);
    }
  };

  const meta = [
    ["Penerbit", book.penerbit],
    ["Tahun terbit", book.tahunTerbit],
    ["Edisi", book.edisi],
    ["ISBN", book.isbn],
    ["Bahasa", book.bahasa],
    ["Halaman", book.halaman || null],
    ["Ukuran file", book.file?.size ? formatSize(book.file.size) : null],
    ["Ditambahkan", formatDate(book.createdAt)],
    ["Lisensi", book.lisensi],
    [
      "Sumber",
      book.sumber &&
        (book.sumberUrl ? (
          <a href={book.sumberUrl} target="_blank" rel="noopener noreferrer" className="text-teal hover:underline">
            {book.sumber}
          </a>
        ) : (
          book.sumber
        )),
    ],
  ].filter(([, v]) => v);

  return (
    <div className="container-page py-8">
      {book.status !== "disetujui" && (
        <div className="mb-6 rounded-xl border border-amber-300/50 bg-amber-500/10 p-4 text-sm">
          <div className="flex items-center gap-2">
            <StatusBadge status={book.status} />
            <span className="text-ink-soft">Buku ini hanya terlihat olehmu dan admin sampai disetujui.</span>
          </div>
          {book.catatanReview && <p className="mt-2 text-ink">Catatan admin: {book.catatanReview}</p>}
        </div>
      )}

      <div className="grid gap-8 md:grid-cols-[240px_1fr] lg:gap-12">
        <div className="mx-auto w-48 md:w-full">
          <BookCover book={book} sizes="lg" />
        </div>
        <div>
          <Link to={`/buku?kategori=${encodeURIComponent(book.kategori)}`} className="text-sm font-semibold text-teal hover:underline">
            {book.kategori}
          </Link>
          <h1 className="mt-1 font-serif text-3xl font-semibold leading-tight sm:text-4xl">{book.judul}</h1>
          <p className="mt-2 text-lg text-ink-soft">{book.penulis}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-mute">
            {book.ratingCount > 0 ? (
              <a href="#ulasan" className="flex items-center gap-1.5 hover:text-ink">
                <Stars value={book.ratingAvg} /> <span className="font-semibold text-ink">{book.ratingAvg.toFixed(1)}</span> ({book.ratingCount} ulasan)
              </a>
            ) : (
              <span>Belum ada ulasan</span>
            )}
            <span>{book.dibaca} kali dibaca</span>
            <span>{book.savedCount} disimpan</span>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <Link to={`/buku/${id}/baca`} className="btn-primary px-6">
              <BookOpen size={18} /> Baca buku
            </Link>
            <button className="btn-outline" onClick={toggleSave} aria-pressed={book.saved}>
              {book.saved ? <BookmarkCheck size={18} className="text-teal" /> : <Bookmark size={18} />}
              {book.saved ? "Tersimpan" : "Simpan"}
            </button>
            <Link to={`/luma?book=${id}`} className="btn-outline">
              <Sparkles size={18} className="text-lantern-text" /> Tanya LUMA
            </Link>
            <button className="btn-ghost" onClick={share} aria-label="Bagikan">
              <Share2 size={18} />
            </button>
          </div>

          {book.deskripsi && <p className="mt-6 max-w-2xl whitespace-pre-line leading-relaxed text-ink-soft">{book.deskripsi}</p>}

          <dl className="mt-6 grid max-w-2xl grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            {meta.map(([k, v]) => (
              <div key={k}>
                <dt className="text-ink-mute">{k}</dt>
                <dd className="font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 flex items-center gap-2 text-sm text-ink-mute">
            Diunggah oleh <Avatar user={book.uploadedBy} size={22} /> <UserLink user={book.uploadedBy} className="text-ink" />
            <ReportButton type="book" id={book._id} ownerId={book.uploadedBy?._id} className="ml-auto text-xs" />
          </p>

          {book.canEdit && (
            <div className="mt-4 flex gap-2">
              <Link to={`/buku/${id}/ubah`} className="btn-outline btn-sm">
                <Pencil size={14} /> Ubah
              </Link>
              <button className="btn-outline btn-sm text-danger" onClick={() => setConfirmDel(true)}>
                <Trash2 size={14} /> Hapus
              </button>
            </div>
          )}
        </div>
      </div>

      <section className="mt-12">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-xl font-bold">Cuplikan</h2>
          <Link to={`/buku/${id}/baca`} className="text-sm font-semibold text-teal hover:underline">
            Buka semua halaman
          </Link>
        </div>
        <PdfPreview bookId={id} onOpen={(p) => navigate(`/buku/${id}/baca?hal=${p}`)} />
      </section>

      <Reviews book={book} onRating={(ratingAvg, ratingCount) => setBook((b) => ({ ...b, ratingAvg, ratingCount }))} />
      {book.status === "disetujui" && <BookDiscussions book={book} />}

      <ConfirmModal open={confirmDel} title="Hapus buku?" message={`“${book.judul}” beserta ulasannya akan dihapus permanen.`} busy={busy} onConfirm={remove} onClose={() => setConfirmDel(false)} />
    </div>
  );
}
