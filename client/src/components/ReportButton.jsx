import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Flag } from "lucide-react";
import { toast } from "react-toastify";
import { api } from "../lib/api";
import { useAuth } from "../context/Auth";
import { ErrorBox, Modal } from "./ui";

const REASONS = [
  ["spam", "Spam atau promosi"],
  ["tidak_pantas", "Kasar, menghina, atau tidak pantas"],
  ["hak_cipta", "Melanggar hak cipta"],
  ["salah_informasi", "Informasi keliru atau menyesatkan"],
  ["lainnya", "Lainnya"],
];
const NOUN = { book: "buku", discussion: "diskusi", comment: "balasan", review: "ulasan" };

// Tombol kecil "Laporkan" untuk buku, diskusi, balasan, atau ulasan milik orang lain.
export default function ReportButton({ type, id, ownerId, className = "", label = true }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [alasan, setAlasan] = useState("");
  const [catatan, setCatatan] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (user && ownerId && String(user._id) === String(ownerId)) return null;

  const start = () => {
    if (!user) return navigate(`/masuk?next=${encodeURIComponent(location.pathname)}`);
    setAlasan("");
    setCatatan("");
    setError("");
    setOpen(true);
  };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api.post("/reports", { targetType: type, target: id, alasan, catatan });
      toast.success(r.message);
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" onClick={start} className={`inline-flex items-center gap-1.5 text-ink-mute hover:text-danger ${className}`} aria-label={`Laporkan ${NOUN[type]}`} title={`Laporkan ${NOUN[type]}`}>
        <Flag size={14} /> {label && "Laporkan"}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Laporkan ${NOUN[type]}`}>
        <form onSubmit={submit} className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm text-ink-soft">Apa masalahnya?</legend>
            {REASONS.map(([v, text]) => (
              <label key={v} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm ${alasan === v ? "border-teal bg-teal-soft" : "border-line hover:border-teal/50"}`}>
                <input type="radio" name="alasan" value={v} checked={alasan === v} onChange={() => setAlasan(v)} className="accent-teal" />
                {text}
              </label>
            ))}
          </fieldset>
          <div>
            <label className="label" htmlFor="rep-catatan">Keterangan {alasan === "lainnya" ? "" : "(opsional)"}</label>
            <textarea id="rep-catatan" className="field min-h-[80px]" maxLength={1000} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder={alasan === "hak_cipta" ? "Sebutkan pemilik hak cipta dan kontakmu" : ""} />
          </div>
          <ErrorBox>{error}</ErrorBox>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Batal</button>
            <button className="btn-primary" disabled={busy || !alasan}>{busy ? "Mengirim…" : "Kirim laporan"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
