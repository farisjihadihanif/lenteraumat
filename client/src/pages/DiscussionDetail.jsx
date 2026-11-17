import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { Pencil, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/Auth";
import Markdown from "../components/Markdown";
import PostActions from "../components/PostActions";
import { DiscussionQuiz } from "../components/quiz/QuizSheet";
import BookCover from "../components/BookCover";
import { Avatar, ConfirmModal, Empty, ErrorBox, PageLoader, Stars, UserLink } from "../components/ui";
import { formatDate, timeAgo } from "../lib/format";

export default function DiscussionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(null);

  useEffect(() => {
    api
      .get(`/discussions/${id}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id, user?._id]);

  if (error) return <div className="container-page py-16"><Empty title="Diskusi tidak ditemukan">{error}</Empty></div>;
  if (!data) return <PageLoader />;
  const { discussion: d, comments } = data;

  const send = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    try {
      const { comment } = await api.post(`/discussions/${id}/comments`, { isi: reply });
      setData((x) => ({ ...x, comments: [...x.comments, comment], discussion: { ...x.discussion, balasanCount: (x.discussion.balasanCount || 0) + 1 } }));
      setReply("");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      if (del === "post") {
        await api.del(`/discussions/${id}`);
        toast.success("Diskusi dihapus.");
        return navigate("/diskusi");
      }
      const own = del.author?._id === user._id;
      await api.del(own || !isAdmin ? `/discussions/${id}/comments/${del._id}` : `/admin/comments/${del._id}`);
      setData((x) => ({ ...x, comments: x.comments.filter((c) => c._id !== del._id) }));
      setDel(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-page max-w-3xl py-8">
      <Link to="/diskusi" className="text-sm font-semibold text-teal hover:underline">
        Semua diskusi
      </Link>
      <article className="mt-4">
        <h1 className="font-serif text-3xl font-semibold leading-tight">{d.judul}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-mute">
          <Avatar user={d.author} size={28} />
          <UserLink user={d.author} className="text-ink" />
          <span className="text-ink-mute">@{d.author?.username}</span>
          <time dateTime={d.createdAt}>{formatDate(d.createdAt)}</time>
        </div>

        {d.book && (
          <Link to={`/buku/${d.book._id}`} className="panel mt-5 flex items-center gap-4 p-3 hover:border-teal/40">
            <div className="w-12 shrink-0">
              <BookCover book={d.book} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-teal">Membahas buku</p>
              <p className="truncate font-serif font-semibold">{d.book.judul}</p>
              <p className="flex items-center gap-2 text-xs text-ink-mute">
                {d.book.penulis} {d.book.ratingAvg > 0 && <Stars value={d.book.ratingAvg} size={11} />}
              </p>
            </div>
          </Link>
        )}

        {d.cover && <img src={d.cover} alt="" className="mt-5 max-h-96 w-full rounded-xl object-cover" />}
        <Markdown className="mt-5 text-base">{d.isi}</Markdown>
        {d.kuis && (
          <DiscussionQuiz
            kuis={d.kuis}
            onToggleShare={async (v) => {
              try {
                const r = await api.patch(`/discussions/${id}`, { kunciPublik: v });
                setData((x) => ({ ...x, discussion: { ...x.discussion, kuis: r.discussion.kuis } }));
                toast.success(v ? "Kunci jawaban dibagikan." : "Kunci jawaban disembunyikan lagi.");
              } catch (e) {
                toast.error(e.message);
              }
            }}
          />
        )}
        <PostActions post={d} onChange={(patch) => setData((x) => ({ ...x, discussion: { ...x.discussion, ...patch } }))} className="mt-6 max-w-md border-y border-line py-1" />

        {d.canEdit && (
          <div className="mt-5 flex gap-2">
            <Link to={`/diskusi/${id}/ubah`} className="btn-outline btn-sm">
              <Pencil size={14} /> Ubah
            </Link>
            <button className="btn-outline btn-sm text-danger" onClick={() => setDel("post")}>
              <Trash2 size={14} /> Hapus
            </button>
          </div>
        )}
      </article>

      <section id="balasan" className="mt-8">
        <h2 className="text-lg font-bold">{comments.length} balasan</h2>
        <ul className="mt-4 space-y-5">
          {comments.map((c) => (
            <li key={c._id} className="flex gap-3">
              <Avatar user={c.author} size={34} />
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <UserLink user={c.author} /> <span className="text-xs text-ink-mute">· {timeAgo(c.createdAt)}</span>
                </p>
                <p className="mt-1 whitespace-pre-line text-[15px] text-ink-soft">{c.isi}</p>
                {user && (c.author?._id === user._id || isAdmin) && (
                  <button className="mt-1 text-xs font-semibold text-danger hover:underline" onClick={() => setDel(c)}>
                    Hapus
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>

        {user ? (
          <form onSubmit={send} className="mt-6 flex gap-3">
            <Avatar user={user} size={34} />
            <div className="flex-1">
              <textarea className="field min-h-[90px]" maxLength={5000} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Tulis balasan" aria-label="Balasan" />
              <button className="btn-primary mt-2" disabled={busy || !reply.trim()}>
                Kirim balasan
              </button>
            </div>
          </form>
        ) : (
          <p className="mt-6 rounded-lg bg-surface p-4 text-sm text-ink-soft">
            <Link to={`/masuk?next=/diskusi/${id}`} className="font-semibold text-teal hover:underline">
              Masuk
            </Link>{" "}
            untuk ikut membalas.
          </p>
        )}
      </section>

      <ConfirmModal
        open={Boolean(del)}
        title={del === "post" ? "Hapus diskusi?" : "Hapus balasan?"}
        message={del === "post" ? "Diskusi beserta semua balasannya akan dihapus." : "Balasan ini akan dihapus."}
        busy={busy}
        onConfirm={confirmDelete}
        onClose={() => setDel(null)}
      />
    </div>
  );
}
