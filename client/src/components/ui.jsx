import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Star, X, ChevronLeft, ChevronRight } from "lucide-react";
import { STATUS, displayName } from "../lib/format";

export function Spinner({ className = "", label = "Memuat" }) {
  return (
    <span role="status" className={`inline-flex items-center gap-2 text-sm text-ink-mute ${className}`}>
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      <span>{label}…</span>
    </span>
  );
}

export function PageLoader() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <Spinner />
    </div>
  );
}

export function Empty({ title, children, action }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface/60 px-6 py-12 text-center">
      <p className="font-semibold text-ink">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-ink-mute">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBox({ children }) {
  if (!children) return null;
  return <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{children}</p>;
}

export function Stars({ value = 0, size = 14, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`${value} dari 5 bintang`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, value - n + 1));
        return (
          <span key={n} className="relative inline-block" style={{ width: size, height: size }}>
            <Star size={size} className="absolute text-line" fill="currentColor" strokeWidth={0} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star size={size} className="text-lamp" fill="currentColor" strokeWidth={0} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function StarInput({ value, onChange }) {
  const labels = ["", "Kurang", "Cukup", "Bagus", "Sangat bagus", "Luar biasa"];
  return (
    <div className="flex items-center gap-3">
      <div className="flex" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} bintang`}
            onClick={() => onChange(n)}
            className="p-0.5 transition-transform hover:scale-110"
          >
            <Star size={26} strokeWidth={1.5} className={n <= value ? "text-lamp" : "text-line"} fill="currentColor" />
          </button>
        ))}
      </div>
      <span className="text-sm text-ink-mute">{labels[value] || "Pilih bintang"}</span>
    </div>
  );
}

export function Avatar({ user, size = 36 }) {
  const name = displayName(user);
  if (user?.fotoProfil) {
    return <img src={user.fotoProfil} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-teal-soft font-bold text-teal"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function UserLink({ user, className = "" }) {
  if (!user) return <span className={className}>Pengguna dihapus</span>;
  return (
    <Link to={`/profil/${user.username}`} className={`font-semibold hover:underline ${className}`}>
      {displayName(user)}
    </Link>
  );
}

export function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.menunggu;
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>;
}

export function Pagination({ page, pages, onChange }) {
  if (!pages || pages <= 1) return null;
  return (
    <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Halaman">
      <button className="btn-outline btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft size={16} /> Sebelumnya
      </button>
      <span className="text-sm text-ink-mute">
        {page} dari {pages}
      </span>
      <button className="btn-outline btn-sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Berikutnya <ChevronRight size={16} />
      </button>
    </nav>
  );
}

export function Modal({ open, onClose, title, children, width = "max-w-lg" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`w-full ${width} max-h-[90vh] overflow-y-auto rounded-xl bg-surface p-5 shadow-lift`}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="rounded p-1 text-ink-mute hover:bg-mist" onClick={onClose} aria-label="Tutup">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmModal({ open, title, message, confirmLabel = "Hapus", danger = true, busy, onConfirm, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-md">
      <p className="text-sm text-ink-soft">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose} disabled={busy}>
          Batal
        </button>
        <button className={danger ? "btn-danger" : "btn-primary"} onClick={onConfirm} disabled={busy}>
          {busy ? "Memproses…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
