import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Instagram, Linkedin, Settings } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/Auth";
import BookGrid from "../components/BookGrid";
import { Avatar, Empty, PageLoader } from "../components/ui";
import { displayName, formatDate, timeAgo } from "../lib/format";

export default function Profile() {
  const { username } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setData(null);
    api.get(`/users/${username}`).then(setData).catch((e) => setError(e.message));
  }, [username]);
  if (error) return <div className="container-page py-16"><Empty title="Pengguna tidak ditemukan">{error}</Empty></div>;
  if (!data) return <PageLoader />;
  const p = data.user;
  return (
    <div className="container-page py-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <Avatar user={p} size={88} />
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-3xl font-semibold">{displayName(p)}</h1>
          <p className="text-sm text-ink-mute">@{p.username}{p.role === "admin" && " · admin"} · bergabung {formatDate(p.createdAt)}</p>
          {p.bio && <p className="mt-2 max-w-xl text-ink-soft">{p.bio}</p>}
          <div className="mt-2 flex gap-3">
            {p.instagramUrl && <a href={p.instagramUrl} target="_blank" rel="noopener noreferrer" className="text-ink-mute hover:text-ink" aria-label="Instagram"><Instagram size={20} /></a>}
            {p.linkedinUrl && <a href={p.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-ink-mute hover:text-ink" aria-label="LinkedIn"><Linkedin size={20} /></a>}
          </div>
        </div>
        {user?.username === p.username && (
          <Link to="/pengaturan" className="btn-outline btn-sm self-start"><Settings size={14} /> Ubah profil</Link>
        )}
      </div>

      <section className="mt-12">
        <h2 className="mb-6 text-xl font-bold">Buku yang dibagikan</h2>
        {data.books.length ? <BookGrid books={data.books} /> : <p className="text-sm text-ink-mute">Belum ada buku yang tayang.</p>}
      </section>

      {data.discussions.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-xl font-bold">Diskusi</h2>
          <ul className="space-y-2">
            {data.discussions.map((d) => (
              <li key={d._id}>
                <Link to={`/diskusi/${d._id}`} className="panel block p-4 hover:border-teal/40">
                  <p className="font-bold">{d.judul}</p>
                  <p className="mt-1 text-xs text-ink-mute">{d.book ? `${d.book.judul} · ` : ""}{timeAgo(d.createdAt)} · {d.balasanCount} balasan</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
