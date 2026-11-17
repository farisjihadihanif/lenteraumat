import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MessagesSquare, PenSquare, Search } from "lucide-react";
import { api } from "../lib/api";
import { Avatar, Empty, ErrorBox, Pagination, Spinner, UserLink } from "../components/ui";
import BookCover from "../components/BookCover";
import { timeAgo } from "../lib/format";

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

  return (
    <div className="container-page max-w-4xl py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Diskusi</h1>
          <p className="mt-1 text-sm text-ink-mute">Bahas buku yang sedang kamu baca, tanyakan bagian yang sulit, atau bagikan catatanmu.</p>
        </div>
        <Link to="/diskusi/baru" className="btn-primary">
          <PenSquare size={16} /> Mulai diskusi
        </Link>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
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
        <div className="flex rounded-lg border border-line bg-surface p-1 text-sm font-semibold">
          {[
            ["aktif", "Aktif"],
            ["terbaru", "Terbaru"],
            ["ramai", "Ramai"],
          ].map(([v, l]) => (
            <button key={v} onClick={() => update({ sort: v })} className={`rounded-md px-3 py-1.5 ${sort === v ? "bg-night text-white" : "text-ink-soft"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <ErrorBox>{error}</ErrorBox>
        {!res && !error && <Spinner />}
        {res && res.items.length === 0 && (
          <Empty title="Belum ada diskusi" action={<Link to="/diskusi/baru" className="btn-primary">Mulai diskusi pertama</Link>}>
            Pertanyaan sederhana pun bisa jadi awal diskusi yang bermanfaat.
          </Empty>
        )}
        <ul className="space-y-3">
          {res?.items.map((d) => (
            <li key={d._id}>
              <Link to={`/diskusi/${d._id}`} className="panel flex gap-4 p-4 hover:border-teal/40 sm:p-5">
                <div className="min-w-0 flex-1">
                  {d.book && <p className="mb-1 truncate text-xs font-semibold text-teal">{d.book.judul}</p>}
                  <h2 className="font-bold">{d.judul}</h2>
                  <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{d.cuplikan}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-mute">
                    <Avatar user={d.author} size={20} />
                    <UserLink user={d.author} className="text-ink-soft" />
                    <span>· {timeAgo(d.createdAt)}</span>
                    <span className="inline-flex items-center gap-1">
                      · <MessagesSquare size={12} /> {d.balasanCount}
                    </span>
                  </div>
                </div>
                {d.book ? (
                  <div className="hidden w-14 shrink-0 sm:block">
                    <BookCover book={d.book} />
                  </div>
                ) : d.cover ? (
                  <img src={d.cover} alt="" className="hidden h-20 w-28 shrink-0 rounded-lg object-cover sm:block" />
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
        {res && <Pagination page={res.page} pages={res.pages} onChange={(p) => update({ page: String(p) })} />}
      </div>
    </div>
  );
}
