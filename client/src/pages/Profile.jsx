import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Instagram, Linkedin, Repeat2, Settings } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/Auth";
import BookGrid from "../components/BookGrid";
import { AdminBadge, Avatar, Empty, PageLoader } from "../components/ui";
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
  if (error) return <div className="container-page py-16"><Empty title="User not found">{error}</Empty></div>;
  if (!data) return <PageLoader />;
  const p = data.user;
  return (
    <div className="container-page py-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <Avatar user={p} size={88} />
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-3xl font-semibold">{displayName(p)}</h1>
          <p className="text-sm text-ink-mute">@{p.username} · bergabung {formatDate(p.createdAt)}<AdminBadge user={p} /></p>
          {p.bio && <p className="mt-2 max-w-xl text-ink-soft">{p.bio}</p>}
          <div className="mt-2 flex gap-3">
            {p.instagramUrl && <a href={p.instagramUrl} target="_blank" rel="noopener noreferrer" className="text-ink-mute hover:text-ink" aria-label="Instagram"><Instagram size={20} /></a>}
            {p.linkedinUrl && <a href={p.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-ink-mute hover:text-ink" aria-label="LinkedIn"><Linkedin size={20} /></a>}
          </div>
        </div>
        {user?.username === p.username && (
          <Link to="/pengaturan" className="btn-outline btn-sm self-start"><Settings size={14} /> Edit profile</Link>
        )}
      </div>

      <ProfileTabs data={data} />
    </div>
  );
}

function PostList({ items, repost }) {
  return (
    <ul className="space-y-2">
      {items.map((d) => (
        <li key={d._id}>
          <Link to={`/diskusi/${d._id}`} className="panel block p-4 hover:border-teal/40">
            {repost && (
              <p className="mb-1 flex items-center gap-1 text-xs text-ink-mute">
                <Repeat2 size={13} /> dari {displayName(d.author)} @{d.author?.username}
              </p>
            )}
            <p className="font-bold">{d.judul}</p>
            <p className="mt-1 text-xs text-ink-mute">
              {d.book ? `${d.book.judul} · ` : ""}
              {timeAgo(d.createdAt)} · {d.balasanCount} balasan · {d.likeCount || 0} suka · {d.repostCount || 0} repost
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ProfileTabs({ data }) {
  const tabs = [
    { id: "buku", label: "Books", n: data.books.length },
    { id: "diskusi", label: "Discussions", n: data.discussions.length },
    { id: "repost", label: "Reposts", n: data.reposts?.length || 0 },
  ];
  const [tab, setTab] = useState("buku");
  return (
    <div className="mt-10">
      <div role="tablist" className="flex gap-6 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 pb-3 text-sm font-semibold ${tab === t.id ? "border-teal text-ink" : "border-transparent text-ink-mute hover:text-ink"}`}
          >
            {t.label} <span className="font-normal text-ink-mute">{t.n}</span>
          </button>
        ))}
      </div>
      <div className="pt-6">
        {tab === "buku" && (data.books.length ? <BookGrid books={data.books} /> : <p className="text-sm text-ink-mute">Belum ada buku yang tayang.</p>)}
        {tab === "diskusi" && (data.discussions.length ? <PostList items={data.discussions} /> : <p className="text-sm text-ink-mute">Belum memulai diskusi.</p>)}
        {tab === "repost" && (data.reposts?.length ? <PostList items={data.reposts} repost /> : <p className="text-sm text-ink-mute">Belum ada repost.</p>)}
      </div>
    </div>
  );
}
