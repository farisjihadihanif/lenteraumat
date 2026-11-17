import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { BookCheck, Inbox, LayoutDashboard, Library, Search, Star, Trash2, Users, Check, X, PencilLine, ExternalLink, Upload, Link2, Tags } from "lucide-react";
import { AutoCoverButton, CategoriesTab, ImportBooks } from "./AdminLibrary";
import { api } from "../lib/api";
import { useAuth } from "../context/Auth";
import BookCover from "../components/BookCover";
import { Avatar, ConfirmModal, Empty, ErrorBox, Modal, Pagination, Spinner, Stars, StatusBadge, UserLink } from "../components/ui";
import { displayName, formatDate, formatSize, timeAgo } from "../lib/format";

const TABS = [
  { id: "ringkasan", label: "Ringkasan", icon: LayoutDashboard },
  { id: "masuk", label: "Buku masuk", icon: Inbox },
  { id: "buku", label: "Semua buku", icon: Library },
  { id: "impor", label: "Impor buku", icon: Link2 },
  { id: "kategori", label: "Kategori", icon: Tags },
  { id: "ulasan", label: "Ulasan", icon: Star },
  { id: "pengguna", label: "Pengguna", icon: Users },
];

function ReviewDialog({ book, action, onClose, onDone }) {
  const [catatan, setCatatan] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setCatatan("");
    setError("");
  }, [book, action]);
  if (!book) return null;
  const title = { setujui: "Setujui buku", tolak: "Tolak buku", revisi: "Minta revisi" }[action];
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await api.post(`/admin/books/${book._id}/review`, { action, catatan });
      toast.success({ setujui: "Buku disetujui dan tayang.", tolak: "Buku ditolak.", revisi: "Permintaan revisi dikirim." }[action]);
      onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={title} width="max-w-md">
      <p className="text-sm text-ink-soft">
        <span className="font-semibold text-ink">{book.judul}</span> oleh {book.penulis}
      </p>
      <label className="label mt-4" htmlFor="catatan">
        {action === "setujui" ? "Catatan (opsional)" : action === "tolak" ? "Alasan penolakan" : "Apa yang perlu diperbaiki?"}
      </label>
      <textarea id="catatan" className="field min-h-[100px]" maxLength={1000} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder={action === "tolak" ? "Contoh: buku berhak cipta tanpa izin penerbit." : action === "revisi" ? "Contoh: sampul buram, lengkapi nama penerbit." : ""} />
      <p className="hint">Catatan ini terlihat oleh pengunggah.</p>
      <ErrorBox>{error}</ErrorBox>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Batal</button>
        <button className={action === "tolak" ? "btn-danger" : action === "setujui" ? "btn-teal" : "btn-primary"} disabled={busy || (action !== "setujui" && !catatan.trim())} onClick={submit}>
          {busy ? "Menyimpan…" : title}
        </button>
      </div>
    </Modal>
  );
}

function Overview({ go }) {
  const [s, setS] = useState(null);
  useEffect(() => {
    api.get("/admin/stats").then(setS).catch(() => {});
  }, []);
  if (!s) return <Spinner />;
  const cards = [
    ["Menunggu tinjauan", s.books.menunggu, "masuk", "text-lantern"],
    ["Buku tayang", s.books.disetujui, "buku", "text-teal"],
    ["Perlu revisi", s.books.revisi, "buku", "text-ink"],
    ["Ditolak", s.books.ditolak, "buku", "text-ink"],
    ["Pengguna", s.users, "pengguna", "text-ink"],
    ["Ulasan", s.reviews, "ulasan", "text-ink"],
    ["Diskusi", s.discussions, null, "text-ink"],
    ["Total dibaca", s.reads, null, "text-ink"],
  ];
  return (
    <div className="space-y-6">
      {s.books.menunggu > 0 && (
        <button onClick={() => go("masuk")} className="flex w-full items-center gap-4 rounded-xl bg-lantern-soft p-4 text-left hover:ring-2 hover:ring-lantern/40">
          <Inbox className="text-lantern" />
          <span className="flex-1">
            <span className="font-bold">{s.books.menunggu} buku menunggu tinjauan.</span> <span className="text-sm text-ink-soft">Tinjau supaya pengunggah tidak menunggu lama.</span>
          </span>
          <span className="btn-primary btn-sm">Tinjau</span>
        </button>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(([label, value, tab, color]) => {
          const inner = (
            <>
              <p className={`font-serif text-3xl font-semibold ${color}`}>{value.toLocaleString("id-ID")}</p>
              <p className="mt-1 text-sm text-ink-mute">{label}</p>
            </>
          );
          return tab ? (
            <button key={label} onClick={() => go(tab)} className="panel p-4 text-left hover:border-teal/40">{inner}</button>
          ) : (
            <div key={label} className="panel p-4">{inner}</div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <Link to="/unggah" className="btn-outline"><Upload size={16} /> Unggah buku (langsung tayang)</Link>
        <button onClick={() => go("impor")} className="btn-outline"><Link2 size={16} /> Impor dari tautan</button>
        <Link to="/diskusi" className="btn-outline">Moderasi diskusi</Link>
      </div>
    </div>
  );
}

function Incoming() {
  const [res, setRes] = useState(null);
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState({ book: null, action: null });
  const load = useCallback(() => api.get(`/admin/books?status=menunggu&page=${page}`).then(setRes).catch(() => setRes({ items: [] })), [page]);
  useEffect(() => {
    load();
  }, [load]);
  if (!res) return <Spinner />;
  if (!res.items.length) return <Empty title="Tidak ada buku yang menunggu">Semua unggahan sudah ditinjau.</Empty>;
  return (
    <>
      <p className="mb-4 text-sm text-ink-mute">{res.total} buku, yang terlama di atas.</p>
      <ul className="space-y-3">
        {res.items.map((b) => (
          <li key={b._id} className="panel flex flex-col gap-4 p-4 sm:flex-row">
            <div className="w-20 shrink-0"><BookCover book={b} /></div>
            <div className="min-w-0 flex-1">
              <p className="book-title text-lg">{b.judul}</p>
              <p className="text-sm text-ink-soft">{b.penulis}{b.penerbit ? ` · ${b.penerbit}` : ""}{b.tahunTerbit ? ` · ${b.tahunTerbit}` : ""}</p>
              <p className="mt-1 text-xs text-ink-mute">
                {b.kategori} · {b.halaman} halaman · {formatSize(b.file?.size || 0)}{b.isbn ? ` · ISBN ${b.isbn}` : ""}
              </p>
              <p className="mt-2 flex items-center gap-2 text-xs text-ink-mute">
                <Avatar user={b.uploadedBy} size={18} /> {displayName(b.uploadedBy)} ({b.uploadedBy?.email}) · {timeAgo(b.updatedAt)}
              </p>
              {b.deskripsi && <p className="mt-2 line-clamp-2 text-sm text-ink-soft">{b.deskripsi}</p>}
              {b.catatanReview && <p className="mt-2 text-xs text-ink-mute">Catatan sebelumnya: {b.catatanReview}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to={`/buku/${b._id}/baca`} target="_blank" className="btn-outline btn-sm"><ExternalLink size={14} /> Periksa isi</Link>
                <button className="btn-teal btn-sm" onClick={() => setDialog({ book: b, action: "setujui" })}><Check size={14} /> Setujui</button>
                <button className="btn-outline btn-sm" onClick={() => setDialog({ book: b, action: "revisi" })}><PencilLine size={14} /> Minta revisi</button>
                <button className="btn-outline btn-sm text-red-600" onClick={() => setDialog({ book: b, action: "tolak" })}><X size={14} /> Tolak</button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <Pagination page={res.page} pages={res.pages} onChange={setPage} />
      <ReviewDialog {...dialog} onClose={() => setDialog({ book: null })} onDone={() => { setDialog({ book: null }); load(); }} />
    </>
  );
}

function AllBooks() {
  const [res, setRes] = useState(null);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState({ book: null, action: null });
  const load = useCallback(() => api.get(`/admin/books?${new URLSearchParams({ q: query, status, page })}`).then(setRes), [query, status, page]);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <form className="relative flex-1" onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(q); }}>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
          <input className="field pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari judul atau penulis" />
        </form>
        <select className="field sm:w-48" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} aria-label="Status">
          <option value="">Semua status</option>
          <option value="disetujui">Tayang</option>
          <option value="menunggu">Menunggu</option>
          <option value="revisi">Perlu revisi</option>
          <option value="ditolak">Ditolak</option>
        </select>
        <AutoCoverButton onDone={load} />
      </div>
      {!res ? <Spinner /> : res.items.length === 0 ? <Empty title="Tidak ada buku" /> : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-mist text-left text-xs text-ink-mute">
              <tr>
                <th className="px-4 py-3 font-semibold">Buku</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Pengunggah</th>
                <th className="px-4 py-3 font-semibold">Rating</th>
                <th className="px-4 py-3 font-semibold">Dibaca</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {res.items.map((b) => (
                <tr key={b._id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 shrink-0"><BookCover book={b} /></div>
                      <div className="min-w-0">
                        <Link to={`/buku/${b._id}`} className="line-clamp-1 font-semibold hover:text-teal">{b.judul}</Link>
                        <p className="text-xs text-ink-mute">{b.penulis} · {formatDate(b.createdAt)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                  <td className="px-4 py-3"><UserLink user={b.uploadedBy} /></td>
                  <td className="px-4 py-3">{b.ratingCount ? `${b.ratingAvg.toFixed(1)} (${b.ratingCount})` : "–"}</td>
                  <td className="px-4 py-3">{b.dibaca}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {b.status !== "disetujui" && <button className="btn-ghost btn-sm" onClick={() => setDialog({ book: b, action: "setujui" })}>Setujui</button>}
                      {b.status === "disetujui" && <button className="btn-ghost btn-sm" onClick={() => setDialog({ book: b, action: "revisi" })}>Turunkan</button>}
                      <Link to={`/buku/${b._id}/ubah`} className="btn-ghost btn-sm">Ubah</Link>
                      <button className="btn-ghost btn-sm text-red-600" onClick={() => setDel(b)} aria-label={`Hapus ${b.judul}`}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {res && <Pagination page={res.page} pages={res.pages} onChange={setPage} />}
      <ReviewDialog {...dialog} onClose={() => setDialog({ book: null })} onDone={() => { setDialog({ book: null }); load(); }} />
      <ConfirmModal
        open={Boolean(del)}
        title="Hapus buku?"
        message={`“${del?.judul}” beserta file, ulasan, dan progres bacanya akan dihapus permanen.`}
        busy={busy}
        onClose={() => setDel(null)}
        onConfirm={async () => {
          setBusy(true);
          await api.del(`/books/${del._id}`).then(() => toast.success("Buku dihapus.")).catch((e) => toast.error(e.message));
          setBusy(false);
          setDel(null);
          load();
        }}
      />
    </>
  );
}

function Reviews() {
  const [res, setRes] = useState(null);
  const [rating, setRating] = useState("");
  const [page, setPage] = useState(1);
  const [del, setDel] = useState(null);
  const load = useCallback(() => api.get(`/admin/reviews?${new URLSearchParams({ rating, page })}`).then(setRes), [rating, page]);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1">
        {["", "5", "4", "3", "2", "1"].map((r) => (
          <button key={r} onClick={() => { setPage(1); setRating(r); }} className={`rounded-full border px-3 py-1 text-sm font-semibold ${rating === r ? "border-teal bg-teal text-white" : "border-line bg-surface"}`}>
            {r ? `${r} bintang` : "Semua"}
          </button>
        ))}
      </div>
      {!res ? <Spinner /> : res.items.length === 0 ? <Empty title="Belum ada ulasan" /> : (
        <ul className="space-y-3">
          {res.items.map((r) => (
            <li key={r._id} className="panel flex gap-3 p-4">
              <Avatar user={r.user} size={34} />
              <div className="min-w-0 flex-1">
                <p className="text-sm"><UserLink user={r.user} /> <span className="text-ink-mute">pada</span> {r.book ? <Link to={`/buku/${r.book._id}`} className="font-semibold text-teal hover:underline">{r.book.judul}</Link> : "buku dihapus"}</p>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-mute"><Stars value={r.rating} size={12} /> {timeAgo(r.createdAt)}</div>
                {r.komentar && <p className="mt-1.5 whitespace-pre-line text-sm text-ink-soft">{r.komentar}</p>}
              </div>
              <button className="btn-ghost btn-sm self-start text-red-600" onClick={() => setDel(r)} aria-label="Hapus ulasan"><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      )}
      {res && <Pagination page={res.page} pages={res.pages} onChange={setPage} />}
      <ConfirmModal
        open={Boolean(del)}
        title="Hapus ulasan?"
        message="Ulasan ini akan dihapus dan rating buku dihitung ulang."
        onClose={() => setDel(null)}
        onConfirm={async () => {
          await api.del(`/admin/reviews/${del._id}`).then(() => toast.success("Ulasan dihapus.")).catch((e) => toast.error(e.message));
          setDel(null);
          load();
        }}
      />
    </>
  );
}

function UsersTab() {
  const { user: me } = useAuth();
  const [res, setRes] = useState(null);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get(`/admin/users?${new URLSearchParams({ q: query, role, page })}`).then(setRes), [query, role, page]);
  useEffect(() => {
    load();
  }, [load]);

  const act = async () => {
    setBusy(true);
    try {
      if (confirm.type === "hapus") await api.del(`/admin/users/${confirm.user._id}`);
      else await api.patch(`/admin/users/${confirm.user._id}/role`, { role: confirm.user.role === "admin" ? "user" : "admin" });
      toast.success("Tersimpan.");
      setConfirm(null);
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <form className="relative flex-1" onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(q); }}>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
          <input className="field pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, username, atau email" />
        </form>
        <select className="field sm:w-40" value={role} onChange={(e) => { setPage(1); setRole(e.target.value); }} aria-label="Peran">
          <option value="">Semua peran</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      {!res ? <Spinner /> : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {res.items.map((u) => (
            <li key={u._id} className="flex flex-wrap items-center gap-3 p-4">
              <Avatar user={u} size={38} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  <UserLink user={u} /> {u.role === "admin" && <span className="ml-1 rounded bg-night px-1.5 py-0.5 text-[10px] font-bold text-white">ADMIN</span>}
                </p>
                <p className="truncate text-xs text-ink-mute">@{u.username} · {u.email} · {u.bukuCount} buku · bergabung {formatDate(u.createdAt)}</p>
              </div>
              {u._id !== me._id && (
                <div className="flex gap-1">
                  <button className="btn-outline btn-sm" onClick={() => setConfirm({ type: "peran", user: u })}>
                    {u.role === "admin" ? "Jadikan user" : "Jadikan admin"}
                  </button>
                  <button className="btn-ghost btn-sm text-red-600" onClick={() => setConfirm({ type: "hapus", user: u })} aria-label={`Hapus ${u.username}`}><Trash2 size={14} /></button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {res && <Pagination page={res.page} pages={res.pages} onChange={setPage} />}
      <ConfirmModal
        open={Boolean(confirm)}
        title={confirm?.type === "hapus" ? "Hapus pengguna?" : "Ubah peran?"}
        message={
          confirm?.type === "hapus"
            ? `Akun @${confirm.user.username} beserta buku, ulasan, dan diskusinya akan dihapus permanen.`
            : `@${confirm?.user.username} akan menjadi ${confirm?.user.role === "admin" ? "user biasa" : "admin dan bisa mengelola seluruh perpustakaan"}.`
        }
        confirmLabel={confirm?.type === "hapus" ? "Hapus" : "Ubah peran"}
        danger={confirm?.type === "hapus"}
        busy={busy}
        onClose={() => setConfirm(null)}
        onConfirm={act}
      />
    </>
  );
}

export default function Admin() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "ringkasan";
  const go = (t) => setParams({ tab: t });
  const current = TABS.find((t) => t.id === tab);
  return (
    <div className="container-page grid gap-6 py-8 md:grid-cols-[200px_1fr]">
      <aside>
        <p className="mb-3 flex items-center gap-2 font-serif text-xl font-semibold"><BookCheck size={20} className="text-teal" /> Admin</p>
        <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:flex-col md:px-0" aria-label="Menu admin">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => go(id)} aria-current={tab === id ? "page" : undefined} className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold ${tab === id ? "bg-night text-white" : "text-ink-soft hover:bg-surface"}`}>
              <Icon size={16} /> {label}
            </button>
          ))}
        </nav>
      </aside>
      <section className="min-w-0">
        <h1 className="mb-5 text-2xl font-bold">{current.label}</h1>
        {tab === "ringkasan" && <Overview go={go} />}
        {tab === "masuk" && <Incoming />}
        {tab === "buku" && <AllBooks />}
        {tab === "impor" && <ImportBooks />}
        {tab === "kategori" && <CategoriesTab />}
        {tab === "ulasan" && <Reviews />}
        {tab === "pengguna" && <UsersTab />}
      </section>
    </div>
  );
}
