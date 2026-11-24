import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { CornerDownRight, Pencil, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/Auth";
import Markdown from "../components/Markdown";
import PostActions from "../components/PostActions";
import { DiscussionQuiz } from "../components/quiz/QuizSheet";
import BookCover from "../components/BookCover";
import ReportButton from "../components/ReportButton";
import { Avatar, ConfirmModal, Empty, ErrorBox, PageLoader, Stars, UserLink } from "../components/ui";
import { formatDate, timeAgo } from "../lib/format";

// Komentar utama + balasannya (satu tingkat). Balasan yang induknya hilang tampil sebagai komentar biasa.
function threads(comments) {
  const ids = new Set(comments.map((c) => c._id));
  const top = comments.filter((c) => !c.parent || !ids.has(c.parent));
  return top.map((c) => ({ c, replies: comments.filter((r) => r.parent === c._id) }));
}

function CommentItem({ c, discussionId, onAdded, onDelete, small = false }) {
  const { user, isAdmin } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      const { comment } = await api.post(`/discussions/${discussionId}/comments`, { isi: text, parent: c._id });
      onAdded(comment);
      setText("");
      setOpen(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex gap-3">
      <Avatar user={c.author} size={small ? 28 : 34} />
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <UserLink user={c.author} /> <span className="text-xs text-ink-mute">· {timeAgo(c.createdAt)}</span>
        </p>
        {c.replyTo && (
          <p className="text-xs text-ink-mute">
            membalas{" "}
            <Link to={`/profil/${c.replyTo.username}`} className="text-teal hover:underline">
              @{c.replyTo.username}
            </Link>
          </p>
        )}
        <p className="mt-1 whitespace-pre-line text-[15px] text-ink-soft">{c.isi}</p>
        <div className="mt-1 flex gap-4 text-xs">
          {user ? (
            <button className="inline-flex items-center gap-1 font-semibold text-ink-mute hover:text-teal" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              <CornerDownRight size={13} /> Reply
            </button>
          ) : (
            <Link to={`/masuk?next=${encodeURIComponent(location.pathname)}`} className="inline-flex items-center gap-1 font-semibold text-ink-mute hover:text-teal">
              <CornerDownRight size={13} /> Reply
            </Link>
          )}
          <ReportButton type="comment" id={c._id} ownerId={c.author?._id} />
          {user && (c.author?._id === user._id || isAdmin) && (
            <button className="font-semibold text-danger hover:underline" onClick={() => onDelete(c)}>
              Delete
            </button>
          )}
        </div>
        {open && (
          <form onSubmit={send} className="mt-3">
            <textarea
              autoFocus
              className="field min-h-[70px] text-sm"
              maxLength={5000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Balas @${c.author?.username || ""}`}
              aria-label={`Balas komentar @${c.author?.username || ""}`}
            />
            <div className="mt-2 flex gap-2">
              <button className="btn-primary btn-sm" disabled={busy || !text.trim()}>
                {busy ? "Sending…" : "Send"}
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

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

  if (error) return <div className="container-page py-16"><Empty title="Discussion not found">{error}</Empty></div>;
  if (!data) return <PageLoader />;
  const { discussion: d, comments } = data;

  const send = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    try {
      const { comment } = await api.post(`/discussions/${id}/comments`, { isi: reply });
      addComment(comment);
      setReply("");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const addComment = (comment) =>
    setData((x) => ({ ...x, comments: [...x.comments, comment], discussion: { ...x.discussion, balasanCount: (x.discussion.balasanCount || 0) + 1 } }));

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
      setData((x) => ({ ...x, comments: x.comments.filter((c) => c._id !== del._id && c.parent !== del._id) }));
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
        All discussions
      </Link>
      <article className="mt-4">
        <h1 className="font-serif text-3xl font-semibold leading-tight">{d.judul}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-mute">
          <Avatar user={d.author} size={28} />
          <UserLink user={d.author} className="text-ink" />
          <time dateTime={d.createdAt}>· {formatDate(d.createdAt)}</time>
          <ReportButton type="discussion" id={d._id} ownerId={d.author?._id} className="ml-auto text-xs" />
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
              <Pencil size={14} /> Edit
            </Link>
            <button className="btn-outline btn-sm text-danger" onClick={() => setDel("post")}>
              <Trash2 size={14} /> Delete
            </button>
          </div>
        )}
      </article>

      <section id="balasan" className="mt-8">
        <h2 className="text-lg font-bold">{comments.length} {comments.length === 1 ? "comment" : "comments"}</h2>
        <ul className="mt-4 space-y-5">
          {threads(comments).map(({ c, replies }) => (
            <li key={c._id}>
              <CommentItem c={c} discussionId={id} onAdded={addComment} onDelete={setDel} />
              {replies.length > 0 && (
                <ul className="ml-[17px] mt-3 space-y-4 border-l-2 border-line pl-5">
                  {replies.map((r) => (
                    <li key={r._id}>
                      <CommentItem c={r} discussionId={id} onAdded={addComment} onDelete={setDel} small />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>

        {user ? (
          <form onSubmit={send} className="mt-6 flex gap-3">
            <Avatar user={user} size={34} />
            <div className="flex-1">
              <textarea className="field min-h-[90px]" maxLength={5000} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Tulis komentar" aria-label="Komentar" />
              <button className="btn-primary mt-2" disabled={busy || !reply.trim()}>
                Post comment
              </button>
            </div>
          </form>
        ) : (
          <p className="mt-6 rounded-lg bg-surface p-4 text-sm text-ink-soft">
            <Link to={`/masuk?next=/diskusi/${id}`} className="font-semibold text-teal hover:underline">
              Sign in
            </Link>{" "}
            untuk ikut membalas.
          </p>
        )}
      </section>

      <ConfirmModal
        open={Boolean(del)}
        title={del === "post" ? "Delete discussion?" : "Delete reply?"}
        message={del === "post" ? "Diskusi beserta semua balasannya akan dihapus." : del && !del.parent && comments.some((c) => c.parent === del._id) ? "Komentar ini dan balasan-balasannya akan dihapus." : "Balasan ini akan dihapus."}
        busy={busy}
        onConfirm={confirmDelete}
        onClose={() => setDel(null)}
      />
    </div>
  );
}
