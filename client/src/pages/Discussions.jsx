import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { PenSquare, Repeat2, Search, FileQuestion } from "lucide-react";
import { api } from "../lib/api";
import { Avatar, Empty, ErrorBox, Pagination, Spinner } from "../components/ui";
import BookCover from "../components/BookCover";
import PostActions from "../components/PostActions";
import { displayName, timeAgo } from "../lib/format";

const SORTS = [
  ["aktif", "Aktif"],
  ["terbaru", "Terbaru"],
  ["hot", "Hot Topic"],
];

export function PostCard({ post, onChange }) {
  const navigate = useNavigate();
  const open = () => navigate(`/diskusi/${post._id}`);
  return (
    <article
      className="cursor-pointer px-4 py-4 transition-colors hover:bg-mist/60 sm:px-5"
      onClick={(e) => {
        if (!e.target.closest("a, button") && !window.getSelection()?.toString()) open();
      }}
    >
      {post.lastRepostBy && (
        <p className="mb-1.5 ml-10 flex items-center gap-1.5 text-xs font-semibold text-ink-mute">
          <Repeat2 size={14} /> {displayName(post.lastRepostBy)} me-repost
        </p>
      )}
      <div className="flex gap-3">
        <Link to={`/profil/${post.author?.username}`} className="shrink-0">
          <Avatar user={post.author} size={42} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
            <Link to={`/profil/${post.author?.username}`} className="font-bold hover:underline">
              {displayName(post.author)}
            </Link>
            <span className="text-ink-mute">@{post.author?.username}</span>
            <span className="text-ink-mute" aria-hidden>
              ·
            </span>
            <time className="text-ink-mute" dateTime={post.createdAt}>
              {timeAgo(post.createdAt)}
            </time>
          </p>
          <Link to={`/diskusi/${post._id}`} className="mt-0.5 block font-semibold leading-snug hover:underline">
            {post.judul}
          </Link>
          <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-ink-soft">
            {post.cuplikan}
            {post.terpotong && <span className="text-teal"> …lanjut</span>}
          </p>
          {post.kuis?.soal?.length > 0 && (
            <Link to={`/diskusi/${post._id}`} className="mt-3 flex items-center gap-3 rounded-2xl border border-line p-3 hover:bg-mist">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-teal-soft text-teal">
                <FileQuestion size={18} />
              </span>
              <span className="min-w-0 text-sm">
                <span className="block font-semibold text-ink">Lembar soal · {post.kuis.soal.length} soal</span>
                <span className="block truncate text-ink-mute">{[post.kuis.jenjang, post.kuis.level && `tingkat ${post.kuis.level}`].filter(Boolean).join(" · ") || "Jawab di balasan"}</span>
              </span>
            </Link>
          )}
          {post.cover && <img src={post.cover} alt="" className="mt-3 max-h-80 w-full rounded-2xl border border-line object-cover" />}
          {post.book && (
            <Link to={`/buku/${post.book._id}`} className="mt-3 flex items-center gap-3 rounded-2xl border border-line p-2.5 hover:bg-mist">
              <div className="w-9 shrink-0">
                <BookCover book={post.book} />
              </div>
              <div className="min-w-0">
                <p className="truncate font-serif text-sm font-semibold">{post.book.judul}</p>
                <p className="truncate text-xs text-ink-mute">{post.book.penulis}</p>
              </div>
            </Link>
          )}
          <PostActions post={post} onChange={onChange} className="-ml-2 mt-2 max-w-md" />
        </div>
      </div>
    </article>
  );
}

export default function Discussions() {
  const [params, setParams] = useSearchParams();
  const sort = params.get("sort") || "aktif";
  const q = params.get("q") || "";
  const page = Number(params.get("page")) || 1;
  const [input, setInput] = useState(q);
  const [res, setRes] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setRes(null);
    api
      .get(`/discussions?${new URLSearchParams({ sort, q, page })}`)
      .then(setRes)
      .catch((e) => setError(e.message));
  }, [sort, q, page]);

  const update = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    if (!("page" in patch)) next.delete("page");
    setParams(next);
  };
  const patchPost = (id, patch) => setRes((r) => ({ ...r, items: r.items.map((p) => (p._id === id ? { ...p, ...patch } : p)) }));

  return (
    <div className="container-page max-w-3xl py-8">
      <h1 className="font-serif text-3xl font-semibold">Discussion</h1>
      <p className="mt-1 text-sm text-ink-mute">Bahas buku yang sedang kamu baca, tanyakan bagian yang sulit, atau bagikan soal latihan.</p>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: input.trim() });
          }}
        >
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
          <input className="field pl-9" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Cari diskusi" aria-label="Cari diskusi" />
        </form>
        <Link to="/diskusi/baru" className="btn-primary shrink-0">
          <PenSquare size={16} /> Start discussion
        </Link>
        <select className="field sm:w-40" value={sort} onChange={(e) => update({ sort: e.target.value === "aktif" ? "" : e.target.value })} aria-label="Urutkan diskusi">
          {SORTS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-6">
        <ErrorBox>{error}</ErrorBox>
        {!res && !error && <Spinner />}
        {res && res.items.length === 0 && (
          <Empty title={q ? "Tidak ada diskusi yang cocok" : "Belum ada diskusi"} action={<Link to="/diskusi/baru" className="btn-primary">Start discussion</Link>}>
            {q ? "Coba kata kunci lain." : "Pertanyaan sederhana pun bisa jadi awal diskusi yang bermanfaat."}
          </Empty>
        )}
        {res?.items.length > 0 && (
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {res.items.map((p) => (
              <PostCard key={p._id} post={p} onChange={(patch) => patchPost(p._id, patch)} />
            ))}
          </div>
        )}
        {res && <Pagination page={res.page} pages={res.pages} onChange={(p) => update({ page: String(p) })} />}
      </div>
    </div>
  );
}
