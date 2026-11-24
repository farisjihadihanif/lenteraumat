import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { FileText, ImagePlus } from "lucide-react";
import { saveBook, api } from "../lib/api";
import { coverFromPdf } from "../lib/pdf";
import { useAuth } from "../context/Auth";
import BookCover from "../components/BookCover";
import { ErrorBox, PageLoader } from "../components/ui";
import { formatSize } from "../lib/format";
import { useCategories } from "../lib/categories";

const EMPTY = { judul: "", penulis: "", penerbit: "", tahunTerbit: "", isbn: "", edisi: "", bahasa: "Indonesia", kategori: "Umum", deskripsi: "", sumber: "", sumberUrl: "", lisensi: "" };
const MAX_MB = 40;

export default function UploadBook() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [pdf, setPdf] = useState(null);
  const [cover, setCover] = useState(null);
  const [preview, setPreview] = useState("");
  const [autoCover, setAutoCover] = useState(false);
  const [existing, setExisting] = useState(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rights, setRights] = useState(Boolean(id));
  const categories = useCategories();

  useEffect(() => {
    if (!id) return;
    api.get(`/books/${id}`).then(({ book }) => {
      if (!book.canEdit) return navigate(`/buku/${id}`, { replace: true });
      setExisting(book);
      setForm(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, book[k] ?? ""])));
      setPreview(book.cover || "");
    });
  }, [id, navigate]);

  useEffect(() => () => preview.startsWith("blob:") && URL.revokeObjectURL(preview), [preview]);

  if (id && !existing) return <PageLoader />;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const pickPdf = async (file) => {
    setError("");
    if (!file) return;
    if (file.type !== "application/pdf") return setError("File buku harus PDF.");
    if (file.size > MAX_MB * 1048576) return setError(`Ukuran PDF maksimal ${MAX_MB} MB.`);
    setPdf(file);
    if (!form.judul) setForm((f) => ({ ...f, judul: file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim() }));
    // Sampul otomatis dari halaman pertama kalau belum memilih gambar sampul.
    if (!cover && !existing?.cover) {
      try {
        const c = await coverFromPdf(file);
        if (c) {
          setCover(c);
          setAutoCover(true);
          setPreview(URL.createObjectURL(c));
        }
      } catch {
        setError("PDF tidak bisa dibuka. Pastikan file tidak rusak atau terkunci password.");
        setPdf(null);
      }
    }
  };

  const pickCover = (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Sampul harus berupa gambar.");
    if (file.size > 5 * 1048576) return setError("Ukuran gambar sampul maksimal 5 MB.");
    setCover(file);
    setAutoCover(false);
    setPreview(URL.createObjectURL(file));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!id && !pdf) return setError("Pilih file PDF bukunya dulu.");
    if (!rights) return setError("Centang pernyataan hak unggah terlebih dahulu.");
    setBusy(true);
    setError("");
    try {
      const { book } = await saveBook(id ? "PATCH" : "POST", id ? `/books/${id}` : "/books", form, { pdf, cover }, setProgress);
      toast.success(book.status === "disetujui" ? "Buku tersimpan dan sudah tayang." : "Buku terkirim. Admin akan meninjaunya.");
      navigate(book.status === "disetujui" ? `/buku/${book._id}` : "/rak?tab=unggahan");
    } catch (err) {
      setError(err.message);
      setBusy(false);
      setProgress(0);
    }
  };

  return (
    <div className="container-page max-w-4xl py-8">
      <h1 className="font-serif text-3xl font-semibold">{id ? "Ubah buku" : "Unggah buku"}</h1>
      <p className="mt-1 text-sm text-ink-mute">
        {isAdmin ? "Sebagai admin, buku yang kamu simpan langsung tayang." : id ? "Setelah disimpan, buku akan ditinjau ulang oleh admin." : "Buku akan tayang setelah ditinjau admin."}
      </p>
      {existing?.catatanReview && existing.status !== "disetujui" && (
        <p className="mt-4 rounded-lg border border-sky-300/50 bg-sky-500/10 px-4 py-3 text-sm">Catatan admin: {existing.catatanReview}</p>
      )}

      <form onSubmit={submit} className="mt-6 grid gap-8 md:grid-cols-[220px_1fr]">
        <div className="space-y-4">
          <div className="mx-auto w-40 md:w-full">
            {preview ? (
              <div className="aspect-[2/3] overflow-hidden rounded-[3px_6px_6px_3px] shadow-book"><img src={preview} alt="Pratinjau sampul" className="h-full w-full object-cover" /></div>
            ) : (
              <BookCover book={{ judul: form.judul || "Judul buku", penulis: form.penulis }} />
            )}
          </div>
          {autoCover && <p className="hint text-center">Sampul diambil dari halaman pertama PDF.</p>}
          <label className="btn-outline w-full cursor-pointer">
            <ImagePlus size={16} /> {preview ? "Ganti sampul" : "Pilih sampul"}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => pickCover(e.target.files[0])} />
          </label>
        </div>

        <div className="space-y-5">
          <div>
            <span className="label">File buku (PDF){id && " — kosongkan bila tidak diganti"}</span>
            <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-4 py-5 ${pdf ? "border-teal bg-teal-soft" : "border-line bg-surface hover:border-teal/50"}`}>
              <FileText size={28} className="shrink-0 text-teal" />
              <span className="min-w-0 text-sm">
                {pdf ? (
                  <>
                    <span className="block truncate font-semibold">{pdf.name}</span>
                    <span className="text-ink-mute">{formatSize(pdf.size)}</span>
                  </>
                ) : (
                  <>
                    <span className="block font-semibold">Pilih file PDF</span>
                    <span className="text-ink-mute">Maksimal {MAX_MB} MB. PDF berteks (bukan hasil scan) membuat LUMA bisa membacanya.</span>
                  </>
                )}
              </span>
              <input type="file" accept="application/pdf" className="sr-only" onChange={(e) => pickPdf(e.target.files[0])} />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="judul">Judul</label>
              <input id="judul" className="field" required maxLength={200} value={form.judul} onChange={set("judul")} />
            </div>
            <div>
              <label className="label" htmlFor="penulis">Penulis</label>
              <input id="penulis" className="field" required maxLength={150} value={form.penulis} onChange={set("penulis")} />
            </div>
            <div>
              <label className="label" htmlFor="kategori">Kategori</label>
              <select id="kategori" className="field" value={form.kategori} onChange={set("kategori")}>
                {categories.map((c) => <option key={c.name}>{c.name}</option>)}
                {!categories.some((c) => c.name === form.kategori) && <option>{form.kategori}</option>}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="penerbit">Penerbit</label>
              <input id="penerbit" className="field" maxLength={150} value={form.penerbit} onChange={set("penerbit")} />
            </div>
            <div>
              <label className="label" htmlFor="tahun">Tahun terbit</label>
              <input id="tahun" className="field" inputMode="numeric" maxLength={4} value={form.tahunTerbit} onChange={(e) => setForm((f) => ({ ...f, tahunTerbit: e.target.value.replace(/\D/g, "") }))} />
            </div>
            <div>
              <label className="label" htmlFor="isbn">ISBN</label>
              <input id="isbn" className="field" maxLength={30} value={form.isbn} onChange={set("isbn")} />
            </div>
            <div>
              <label className="label" htmlFor="edisi">Edisi</label>
              <input id="edisi" className="field" maxLength={50} value={form.edisi} onChange={set("edisi")} />
            </div>
            <div>
              <label className="label" htmlFor="sumber">Sumber <span className="font-normal text-ink-mute">(opsional)</span></label>
              <input id="sumber" className="field" maxLength={150} value={form.sumber} onChange={set("sumber")} placeholder="Mis. Karya sendiri, SIBI Kemendikdasmen" />
            </div>
            <div>
              <label className="label" htmlFor="lisensi">Lisensi <span className="font-normal text-ink-mute">(opsional)</span></label>
              <input id="lisensi" className="field" maxLength={150} value={form.lisensi} onChange={set("lisensi")} placeholder="Mis. CC BY 4.0, Domain publik" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="sumberUrl">Tautan sumber <span className="font-normal text-ink-mute">(opsional)</span></label>
              <input id="sumberUrl" type="url" className="field" maxLength={500} value={form.sumberUrl} onChange={set("sumberUrl")} placeholder="https://" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="deskripsi">Deskripsi</label>
              <textarea id="deskripsi" className="field min-h-[120px]" maxLength={3000} value={form.deskripsi} onChange={set("deskripsi")} placeholder="Ceritakan singkat isi buku ini." />
            </div>
          </div>

          {!id && (
            <label className="flex items-start gap-3 text-sm text-ink-soft">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-teal" checked={rights} onChange={(e) => setRights(e.target.checked)} />
              <span>
                Saya memiliki hak atau izin untuk membagikan buku ini secara gratis, dan isinya tidak melanggar{" "}
                <Link to="/ketentuan" target="_blank" className="font-semibold text-teal hover:underline">ketentuan</Link>.
              </span>
            </label>
          )}

          <ErrorBox>{error}</ErrorBox>
          {busy && progress > 0 && (
            <div>
              <div className="h-2 overflow-hidden rounded-full bg-line">
                <div className="h-full bg-lantern transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="hint">{progress < 100 ? `Mengunggah ${progress}%` : "Memproses PDF…"}</p>
            </div>
          )}
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy}>{busy ? "Menyimpan…" : id ? "Simpan perubahan" : isAdmin ? "Simpan & tayangkan" : "Kirim untuk ditinjau"}</button>
            <button type="button" className="btn-ghost" onClick={() => navigate(-1)}>Batal</button>
          </div>
        </div>
      </form>
    </div>
  );
}
