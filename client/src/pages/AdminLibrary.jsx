import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { Check, ExternalLink, ImagePlus, Link2, Pencil, Plus, Trash2, X } from "lucide-react";
import { api, fileUrl, saveBook } from "../lib/api";
import { coverFromPdf } from "../lib/pdf";
import { refreshCategories, useCategories } from "../lib/categories";
import { ConfirmModal, ErrorBox, Spinner } from "../components/ui";

// Buat sampul dari halaman pertama PDF lalu simpan ke buku.
// eslint-disable-next-line react-refresh/only-export-components
export async function makeCover(bookId) {
  const cover = await coverFromPdf(fileUrl(bookId));
  if (!cover) throw new Error("Sampul gagal dibuat.");
  return saveBook("PATCH", `/books/${bookId}`, {}, { cover });
}

const SOURCES = [
  { name: "SIBI Kemendikdasmen", url: "https://buku.kemendikdasmen.go.id/katalog", lisensi: "Bebas disebarluaskan (buku pemerintah)", note: "Buku teks & nonteks resmi, gratis. Buka buku, salin tautan tombol Unduh/PDF." },
  { name: "Smithsonian Libraries", url: "https://library.si.edu/digital-library", lisensi: "Domain publik", note: "Buku lama domain publik. Pakai tautan unduhan PDF-nya." },
  { name: "Project Gutenberg", url: "https://www.gutenberg.org", lisensi: "Domain publik", note: "Klasik domain publik (cari yang punya versi PDF)." },
  { name: "Internet Archive", url: "https://archive.org/details/texts", lisensi: "Domain publik", note: "Pilih koleksi perpustakaan/universitas, terbit sebelum 1929." },
];

const EMPTY = { url: "", judul: "", penulis: "", kategori: "Umum", penerbit: "", tahunTerbit: "", bahasa: "Indonesia", deskripsi: "", sumber: "", sumberUrl: "", lisensi: "", simpan: "salin" };

export function ImportBooks() {
  const categories = useCategories();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState([]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const applySource = (s) => setForm((f) => ({ ...f, sumber: s.name, lisensi: s.lisensi }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy("Downloading PDF from source…");
    try {
      const { book, linked } = await api.post("/admin/books/import", form);
      let cover = false;
      setBusy("Creating cover from the first page…");
      try {
        await makeCover(book._id);
        cover = true;
      } catch {
        /* sampul tipografi dipakai */
      }
      toast.success("Buku diimpor dan langsung tayang.");
      setDone((d) => [{ ...book, linked, cover }, ...d]);
      setForm((f) => ({ ...EMPTY, sumber: f.sumber, lisensi: f.lisensi, kategori: f.kategori, bahasa: f.bahasa }));
      refreshCategories();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
      <form onSubmit={submit} className="panel space-y-4 p-5">
        <div>
          <label className="label" htmlFor="url">Tautan PDF</label>
          <input id="url" type="url" required className="field" value={form.url} onChange={set("url")} placeholder="https://…/buku.pdf" />
          <p className="hint">Tempel tautan unduhan PDF-nya langsung (biasanya berakhiran .pdf), bukan halaman web bukunya.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="ijudul">Judul</label>
            <input id="ijudul" required className="field" maxLength={200} value={form.judul} onChange={set("judul")} />
          </div>
          <div>
            <label className="label" htmlFor="ipenulis">Penulis</label>
            <input id="ipenulis" required className="field" maxLength={150} value={form.penulis} onChange={set("penulis")} />
          </div>
          <div>
            <label className="label" htmlFor="ikategori">Kategori</label>
            <input id="ikategori" list="daftar-kategori" className="field" maxLength={60} value={form.kategori} onChange={set("kategori")} />
            <datalist id="daftar-kategori">
              {categories.map((c) => (
                <option key={c.name} value={c.name} />
              ))}
            </datalist>
            <p className="hint">Pilih dari daftar, atau ketik nama baru untuk membuat kategori.</p>
          </div>
          <div>
            <label className="label" htmlFor="ipenerbit">Penerbit</label>
            <input id="ipenerbit" className="field" maxLength={150} value={form.penerbit} onChange={set("penerbit")} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="itahun">Tahun</label>
              <input id="itahun" inputMode="numeric" maxLength={4} className="field" value={form.tahunTerbit} onChange={(e) => setForm((f) => ({ ...f, tahunTerbit: e.target.value.replace(/\D/g, "") }))} />
            </div>
            <div>
              <label className="label" htmlFor="ibahasa">Bahasa</label>
              <input id="ibahasa" className="field" maxLength={40} value={form.bahasa} onChange={set("bahasa")} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="isumber">Sumber</label>
            <input id="isumber" required className="field" maxLength={150} value={form.sumber} onChange={set("sumber")} placeholder="Mis. SIBI Kemendikdasmen" />
          </div>
          <div>
            <label className="label" htmlFor="ilisensi">Lisensi</label>
            <input id="ilisensi" required className="field" maxLength={150} value={form.lisensi} onChange={set("lisensi")} placeholder="Mis. Domain publik, CC BY 4.0" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="isumberurl">Halaman buku di situs sumber <span className="font-normal text-ink-mute">(opsional)</span></label>
            <input id="isumberurl" type="url" className="field" maxLength={500} value={form.sumberUrl} onChange={set("sumberUrl")} placeholder="Kosongkan untuk memakai tautan PDF" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="ideskripsi">Deskripsi</label>
            <textarea id="ideskripsi" className="field min-h-[90px]" maxLength={3000} value={form.deskripsi} onChange={set("deskripsi")} />
          </div>
        </div>
        <fieldset className="space-y-2 text-sm">
          <legend className="label">Penyimpanan file</legend>
          <label className="flex items-start gap-2">
            <input type="radio" name="simpan" className="mt-1 accent-teal" checked={form.simpan === "salin"} onChange={() => setForm((f) => ({ ...f, simpan: "salin" }))} />
            <span>Simpan salinan di penyimpanan Lentera Umat <span className="text-ink-mute">(paling stabil; PDF di atas batas penyimpanan otomatis ditautkan)</span></span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" name="simpan" className="mt-1 accent-teal" checked={form.simpan === "tautan"} onChange={() => setForm((f) => ({ ...f, simpan: "tautan" }))} />
            <span>Tautkan saja ke sumber <span className="text-ink-mute">(hemat kuota; buku tidak bisa dibuka kalau situs sumber mati)</span></span>
          </label>
        </fieldset>
        <p className="rounded-lg bg-mist px-3 py-2 text-xs text-ink-soft">
          Impor hanya buku yang memang boleh disebarkan ulang: domain publik, lisensi terbuka (Creative Commons), atau buku pemerintah yang dibagikan gratis. Jangan impor skripsi/tesis repositori kampus atau buku dari layanan pinjam seperti iPusnas.
        </p>
        <ErrorBox>{error}</ErrorBox>
        <button className="btn-primary" disabled={Boolean(busy)}>
          <Link2 size={16} /> {busy || "Import book"}
        </button>
      </form>

      <aside className="space-y-4">
        <div className="panel p-4">
          <p className="mb-2 text-sm font-bold">Open book sources</p>
          <ul className="space-y-3 text-sm">
            {SOURCES.map((s) => (
              <li key={s.name}>
                <div className="flex items-center justify-between gap-2">
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-teal hover:underline">
                    {s.name} <ExternalLink size={12} />
                  </a>
                  <button type="button" className="text-xs font-semibold text-ink-mute hover:text-ink" onClick={() => applySource(s)}>
                    Use
                  </button>
                </div>
                <p className="text-xs text-ink-mute">{s.note}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-line pt-3 text-xs text-ink-mute">
            Untuk mengisi banyak buku sekaligus, jalankan <code className="rounded bg-mist px-1">npm run impor:arsip</code> di folder api (lihat README).
          </p>
        </div>
        {done.length > 0 && (
          <div className="panel p-4">
            <p className="mb-2 text-sm font-bold">Recently imported</p>
            <ul className="space-y-2">
              {done.map((b) => (
                <li key={b._id}>
                  <Link to={`/buku/${b._id}`} className="flex items-center gap-2 text-sm hover:text-teal">
                    <Check size={14} className="shrink-0 text-emerald-600" />
                    <span className="truncate">{b.judul}</span>
                    {b.linked && <span className="shrink-0 rounded bg-mist px-1.5 text-[10px] text-ink-mute">ditautkan</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}

export function CategoriesTab() {
  const [items, setItems] = useState(null);
  const [nama, setNama] = useState("");
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get("/admin/categories").then((r) => setItems(r.items)), []);
  useEffect(() => {
    load();
  }, [load]);
  const after = () => {
    load();
    refreshCategories();
  };

  const add = async (e) => {
    e.preventDefault();
    try {
      await api.post("/admin/categories", { nama });
      setNama("");
      toast.success("Kategori ditambahkan.");
      after();
    } catch (err) {
      toast.error(err.message);
    }
  };
  const saveEdit = async () => {
    try {
      await api.patch(`/admin/categories/${edit._id}`, { nama: edit.nama });
      setEdit(null);
      toast.success("Kategori diganti. Buku di dalamnya ikut pindah.");
      after();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (!items) return <Spinner />;
  return (
    <div className="max-w-2xl space-y-4">
      <form onSubmit={add} className="flex gap-2">
        <input className="field" maxLength={60} value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Nama kategori baru" aria-label="Nama kategori baru" />
        <button className="btn-primary shrink-0" disabled={!nama.trim()}>
          <Plus size={16} /> Add
        </button>
      </form>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {items.map((c) => (
          <li key={c._id} className="flex items-center gap-3 px-4 py-3">
            {edit?._id === c._id ? (
              <>
                <input autoFocus className="field py-1.5" value={edit.nama} maxLength={60} onChange={(e) => setEdit({ ...edit, nama: e.target.value })} onKeyDown={(e) => e.key === "Enter" && saveEdit()} aria-label="Nama kategori" />
                <button className="btn-teal btn-sm" onClick={saveEdit} aria-label="Save">
                  <Check size={14} />
                </button>
                <button className="btn-ghost btn-sm" onClick={() => setEdit(null)} aria-label="Cancel">
                  <X size={14} />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 font-semibold">{c.nama}</span>
                <Link to={`/buku?kategori=${encodeURIComponent(c.nama)}`} className="text-sm text-ink-mute hover:text-teal">
                  {c.count} buku
                </Link>
                {c.nama !== "Umum" && (
                  <>
                    <button className="btn-ghost btn-sm" onClick={() => setEdit({ _id: c._id, nama: c.nama })} aria-label={`Rename ${c.nama}`}>
                      <Pencil size={14} />
                    </button>
                    <button className="btn-ghost btn-sm text-danger" onClick={() => setDel(c)} aria-label={`Delete ${c.nama}`}>
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      <ConfirmModal
        open={Boolean(del)}
        title="Delete category?"
        message={`Kategori “${del?.nama}” dihapus. ${del?.count ? `${del.count} buku di dalamnya dipindah ke “Umum”.` : ""}`}
        busy={busy}
        onClose={() => setDel(null)}
        onConfirm={async () => {
          setBusy(true);
          await api.del(`/admin/categories/${del._id}`).then(() => toast.success("Kategori dihapus.")).catch((e) => toast.error(e.message));
          setBusy(false);
          setDel(null);
          after();
        }}
      />
    </div>
  );
}

// Tombol: buat sampul otomatis untuk semua buku yang belum bersampul.
export function AutoCoverButton({ onDone }) {
  const [state, setState] = useState(null);
  const run = async () => {
    const all = [];
    for (let page = 1; page < 50; page++) {
      const r = await api.get(`/admin/books?limit=100&page=${page}`);
      all.push(...r.items.filter((b) => !b.cover));
      if (page >= r.pages) break;
    }
    if (!all.length) return toast.info("Semua buku sudah punya sampul.");
    let ok = 0;
    for (let i = 0; i < all.length; i++) {
      setState({ i: i + 1, n: all.length, judul: all[i].judul });
      try {
        await makeCover(all[i]._id);
        ok++;
      } catch {
        /* lanjut buku berikutnya */
      }
    }
    setState(null);
    toast.success(`${ok} sampul dibuat.`);
    onDone?.();
  };
  return (
    <button className="btn-outline btn-sm" onClick={run} disabled={Boolean(state)} title="Create covers from the first PDF page for books without one">
      <ImagePlus size={14} /> {state ? `Creating cover ${state.i}/${state.n}…` : "Auto covers"}
    </button>
  );
}

