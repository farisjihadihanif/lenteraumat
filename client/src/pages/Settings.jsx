import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { api } from "../lib/api";
import { useAuth } from "../context/Auth";
import { Avatar, ErrorBox, Modal } from "../components/ui";

export default function Settings() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ namaLengkap: user.namaLengkap, bio: user.bio, instagramUrl: user.instagramUrl, linkedinUrl: user.linkedinUrl });
  const [foto, setFoto] = useState(null);
  const [pw, setPw] = useState({ passwordLama: "", passwordBaru: "" });
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState("");
  const [delOpen, setDelOpen] = useState(false);
  const [delPw, setDelPw] = useState("");

  const saveProfile = async (e) => {
    e.preventDefault();
    setBusy("profil");
    setErr({});
    const fd = new FormData();
    for (const [k, v] of Object.entries(form)) fd.append(k, v || "");
    if (foto) fd.append("foto", foto);
    try {
      const r = await api.patch("/users/me", fd);
      setUser(r.user);
      setFoto(null);
      toast.success("Profil tersimpan.");
    } catch (e2) {
      setErr({ profil: e2.message });
    } finally {
      setBusy("");
    }
  };

  const savePw = async (e) => {
    e.preventDefault();
    if (pw.passwordBaru.length < 8) return setErr({ pw: "Password baru minimal 8 karakter." });
    setBusy("pw");
    setErr({});
    try {
      await api.put("/users/me/password", pw);
      setPw({ passwordLama: "", passwordBaru: "" });
      toast.success("Password diganti. Perangkat lain otomatis keluar.");
    } catch (e2) {
      setErr({ pw: e2.message });
    } finally {
      setBusy("");
    }
  };

  const deleteAccount = async () => {
    setBusy("del");
    try {
      await api.del("/users/me", { password: delPw });
      setUser(null);
      toast.success("Akun dihapus.");
      navigate("/");
    } catch (e2) {
      setErr({ del: e2.message });
      setBusy("");
    }
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <div className="container-page max-w-2xl space-y-8 py-8">
      <h1 className="font-serif text-3xl font-semibold">Pengaturan</h1>

      <form onSubmit={saveProfile} className="panel space-y-4 p-5">
        <h2 className="font-bold">Profil</h2>
        <div className="flex items-center gap-4">
          {foto ? <img src={URL.createObjectURL(foto)} alt="" className="h-16 w-16 rounded-full object-cover" /> : <Avatar user={user} size={64} />}
          <label className="btn-outline btn-sm cursor-pointer">
            Ganti foto
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => setFoto(e.target.files[0] || null)} />
          </label>
        </div>
        <div>
          <label className="label" htmlFor="nama">Nama lengkap</label>
          <input id="nama" className="field" required maxLength={100} value={form.namaLengkap} onChange={set("namaLengkap")} />
        </div>
        <div>
          <label className="label" htmlFor="bio">Bio</label>
          <textarea id="bio" className="field" maxLength={300} value={form.bio} onChange={set("bio")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="ig">Instagram</label>
            <input id="ig" className="field" placeholder="https://instagram.com/…" value={form.instagramUrl} onChange={set("instagramUrl")} />
          </div>
          <div>
            <label className="label" htmlFor="li">LinkedIn</label>
            <input id="li" className="field" placeholder="https://linkedin.com/in/…" value={form.linkedinUrl} onChange={set("linkedinUrl")} />
          </div>
        </div>
        <p className="text-sm text-ink-mute">Email: {user.email} · Username: @{user.username}</p>
        <ErrorBox>{err.profil}</ErrorBox>
        <button className="btn-primary" disabled={busy === "profil"}>{busy === "profil" ? "Menyimpan…" : "Simpan profil"}</button>
      </form>

      <form onSubmit={savePw} className="panel space-y-4 p-5">
        <h2 className="font-bold">Ganti password</h2>
        <div>
          <label className="label" htmlFor="old">Password lama</label>
          <input id="old" type="password" className="field" autoComplete="current-password" required value={pw.passwordLama} onChange={(e) => setPw((p) => ({ ...p, passwordLama: e.target.value }))} />
        </div>
        <div>
          <label className="label" htmlFor="new">Password baru</label>
          <input id="new" type="password" className="field" autoComplete="new-password" required value={pw.passwordBaru} onChange={(e) => setPw((p) => ({ ...p, passwordBaru: e.target.value }))} />
        </div>
        <ErrorBox>{err.pw}</ErrorBox>
        <button className="btn-teal" disabled={busy === "pw"}>Ganti password</button>
      </form>

      <section className="rounded-xl border border-red-200 bg-white p-5">
        <h2 className="font-bold text-red-700">Hapus akun</h2>
        <p className="mt-1 text-sm text-ink-soft">Akun, buku unggahan, ulasan, diskusi, dan riwayat LUMA milikmu akan dihapus permanen.</p>
        <button className="btn-outline mt-3 text-red-600" onClick={() => setDelOpen(true)}>Hapus akun saya</button>
      </section>

      <Modal open={delOpen} onClose={() => setDelOpen(false)} title="Hapus akun permanen?" width="max-w-md">
        <p className="text-sm text-ink-soft">Ketik password untuk mengonfirmasi. Tindakan ini tidak bisa dibatalkan.</p>
        <input type="password" className="field mt-3" value={delPw} onChange={(e) => setDelPw(e.target.value)} autoComplete="current-password" aria-label="Password" />
        <ErrorBox>{err.del}</ErrorBox>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setDelOpen(false)}>Batal</button>
          <button className="btn-danger" disabled={!delPw || busy === "del"} onClick={deleteAccount}>Hapus akun</button>
        </div>
      </Modal>
    </div>
  );
}
