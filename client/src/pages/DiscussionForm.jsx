import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { X } from "lucide-react";
import { api } from "../lib/api";
import { compressImage } from "../lib/image";
import BookCover from "../components/BookCover";
import { ErrorBox, PageLoader } from "../components/ui";

function BookSearch({ value, onChange }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!q.trim()) return setItems([]);
    const t = setTimeout(() => api.get(`/books?limit=6&q=${encodeURIComponent(q)}`).then((r) => setItems(r.items)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);
  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-line bg-surface p-2">
        <div className="w-9 shrink-0">
          <BookCover book={value} />
        </div>
        <p className="min-w-0 flex-1 truncate font-serif text-sm font-semibold">{value.judul}</p>
        <button type="button" className="rounded p-1.5 text-ink-mute hover:bg-mist" onClick={() => onChange(null)} aria-label="Remove book">
          <X size={16} />
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input className="field" placeholder="Ketik judul buku (opsional)" value={q} onChange={(e) => setQ(e.target.value)} />
      {items.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface shadow-lift">
          {items.map((b) => (
            <li key={b._id}>
              <button type="button" className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-mist" onClick={() => { onChange(b); setQ(""); }}>
                <div className="w-7 shrink-0">
                  <BookCover book={b} />
                </div>
                <span className="truncate text-sm">{b.judul}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function DiscussionForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ judul: "", isi: "" });
  const [book, setBook] = useState(null);
  const [gambar, setGambar] = useState(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (id) {
      api.get(`/discussions/${id}`).then(({ discussion: d }) => {
        if (!d.canEdit) return navigate(`/diskusi/${id}`, { replace: true });
        setForm({ judul: d.judul, isi: d.isi });
        setBook(d.book || null);
        setLoading(false);
      });
    } else if (params.get("book")) {
      api.get(`/books/${params.get("book")}`).then((r) => setBook(r.book)).catch(() => {});
    }
  }, [id, params, navigate]);

  if (loading) return <PageLoader />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData();
    fd.append("judul", form.judul);
    fd.append("isi", form.isi);
    fd.append("book", book?._id || "");
    try {
      if (gambar) fd.append("gambar", await compressImage(gambar));
      const r = id ? await api.patch(`/discussions/${id}`, fd) : await api.post("/discussions", fd);
      toast.success(id ? "Diskusi diperbarui." : "Diskusi dimulai.");
      navigate(`/diskusi/${r.discussion._id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="container-page max-w-2xl py-8">
      <h1 className="font-serif text-3xl font-semibold">{id ? "Edit discussion" : "Start discussion"}</h1>
      <form onSubmit={submit} className="mt-6 space-y-5">
        <div>
          <label className="label" htmlFor="judul">Judul</label>
          <input id="judul" className="field" maxLength={200} required value={form.judul} onChange={(e) => setForm((f) => ({ ...f, judul: e.target.value }))} placeholder="Contoh: Apa makna sabar di bab 2?" />
        </div>
        <div>
          <span className="label">Buku yang dibahas</span>
          <BookSearch value={book} onChange={setBook} />
        </div>
        <div>
          <label className="label" htmlFor="isi">Isi</label>
          <textarea id="isi" className="field min-h-[220px]" maxLength={20000} required value={form.isi} onChange={(e) => setForm((f) => ({ ...f, isi: e.target.value }))} placeholder="Tulis pertanyaan, pendapat, atau catatanmu." />
          <p className="hint">Mendukung Markdown sederhana: **tebal**, *miring*, daftar dengan tanda -.</p>
        </div>
        <div>
          <label className="label" htmlFor="gambar">Gambar (opsional)</label>
          <input id="gambar" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setGambar(e.target.files[0] || null)} className="text-sm" />
        </div>
        <ErrorBox>{error}</ErrorBox>
        <div className="flex gap-2">
          <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : id ? "Save changes" : "Publish discussion"}</button>
          <button type="button" className="btn-ghost" onClick={() => navigate(-1)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
