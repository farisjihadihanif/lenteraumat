import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, X } from "lucide-react";
import { useAuth } from "../context/Auth";
import { Avatar, ErrorBox } from "../components/ui";
import { displayName } from "../lib/format";
import luma from "../assets/Maskot/Luma1.png";

function safeNext(next) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function Shell({ title, children, footer }) {
  return (
    <div className="grid min-h-[calc(100vh-4rem)] place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <img src={luma} alt="" className="h-14 w-14 rounded-full bg-lamp/25" />
          <h1 className="font-serif text-2xl font-semibold">{title}</h1>
        </div>
        <div className="panel p-6">{children}</div>
        <p className="mt-4 text-center text-sm text-ink-soft">{footer}</p>
      </div>
    </div>
  );
}

function PasswordField({ id, value, onChange, autoComplete, label = "Password" }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <div className="relative">
        <input id={id} type={show ? "text" : "password"} className="field pr-11" value={value} onChange={onChange} autoComplete={autoComplete} required />
        <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-ink-mute hover:text-ink" aria-label={show ? "Sembunyikan password" : "Tampilkan password"}>
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}

// Akun yang tersimpan di perangkat ini: masuk sekali klik.
function SavedAccounts({ onPick }) {
  const { accounts, user, forgetAccount } = useAuth();
  const list = accounts.filter((a) => !user || String(a._id) !== String(user._id));
  if (!list.length) return null;
  return (
    <div className="mb-5">
      <p className="mb-2 text-sm font-semibold text-ink-soft">Akun di perangkat ini</p>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {list.map((a) => (
          <li key={a._id} className="flex items-center">
            <button type="button" onClick={() => onPick(a)} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left hover:bg-mist">
              <Avatar user={a} size={32} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{displayName(a)}</span>
                <span className="block truncate text-xs text-ink-mute">@{a.username}</span>
              </span>
            </button>
            <button type="button" onClick={() => forgetAccount(a._id)} className="mr-2 rounded p-1.5 text-ink-mute hover:bg-mist hover:text-ink" aria-label={`Hapus @${a.username} dari perangkat ini`} title="Hapus dari perangkat ini">
              <X size={14} />
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-center text-xs text-ink-mute">atau masuk dengan akun lain</p>
    </div>
  );
}

export function Login() {
  const { user, login, switchAccount } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ identifier: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const next = safeNext(params.get("next"));
  const adding = params.get("tambah") === "1";
  if (user && !adding) return <Navigate to={next} replace />;

  const pick = async (a) => {
    setError("");
    try {
      await switchAccount(a._id);
      navigate(next, { replace: true });
    } catch {
      setForm((f) => ({ ...f, identifier: a.username }));
      setError("Sesi akun itu sudah berakhir. Masukkan password-nya lagi.");
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(form.identifier.trim(), form.password);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <Shell title={adding ? "Tambah akun" : "Masuk ke Lentera Umat"} footer={<>Belum punya akun? <Link to={`/daftar?next=${encodeURIComponent(next)}`} className="font-semibold text-teal hover:underline">Daftar</Link></>}>
      <SavedAccounts onPick={pick} />
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="identifier">Username atau email</label>
          <input id="identifier" className="field" autoComplete="username" required value={form.identifier} onChange={(e) => setForm((f) => ({ ...f, identifier: e.target.value }))} />
        </div>
        <PasswordField id="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
        <ErrorBox>{error}</ErrorBox>
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Masuk…" : "Masuk"}</button>
      </form>
    </Shell>
  );
}

export function Register() {
  const { user, register } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ namaLengkap: "", username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const next = safeNext(params.get("next"));
  if (user) return <Navigate to={next} replace />;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: k === "username" ? e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, "") : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) return setError("Password minimal 8 karakter.");
    setBusy(true);
    setError("");
    try {
      await register(form);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <Shell title="Buat akun" footer={<>Sudah punya akun? <Link to={`/masuk?next=${encodeURIComponent(next)}`} className="font-semibold text-teal hover:underline">Masuk</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="nama">Nama lengkap</label>
          <input id="nama" className="field" autoComplete="name" required maxLength={100} value={form.namaLengkap} onChange={set("namaLengkap")} />
        </div>
        <div>
          <label className="label" htmlFor="username">Username</label>
          <input id="username" className="field" autoComplete="username" required minLength={3} maxLength={30} value={form.username} onChange={set("username")} />
          <p className="hint">Huruf kecil, angka, titik, atau garis bawah.</p>
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" className="field" autoComplete="email" required value={form.email} onChange={set("email")} />
        </div>
        <PasswordField id="password" autoComplete="new-password" value={form.password} onChange={set("password")} />
        <p className="hint -mt-2">Minimal 8 karakter.</p>
        <ErrorBox>{error}</ErrorBox>
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Membuat akun…" : "Daftar"}</button>
      </form>
    </Shell>
  );
}
