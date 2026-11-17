import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { Heart, MessageCircle, Repeat2, Share } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/Auth";

// Baris aksi ala Twitter/X: balas, repost, suka, bagikan.
export default function PostActions({ post, onChange, className = "" }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState("");

  const toggle = async (kind) => {
    if (!user) return navigate(`/masuk?next=/diskusi/${post._id}`);
    if (busy) return;
    const isLike = kind === "like";
    const activeKey = isLike ? "likedByMe" : "repostedByMe";
    const countKey = isLike ? "likeCount" : "repostCount";
    const prev = { [activeKey]: post[activeKey], [countKey]: post[countKey] || 0 };
    // Tampilkan langsung, lalu sesuaikan dengan jawaban server.
    onChange({ [activeKey]: !prev[activeKey], [countKey]: prev[countKey] + (prev[activeKey] ? -1 : 1) });
    setBusy(kind);
    try {
      const r = await api.post(`/discussions/${post._id}/${kind}`);
      onChange({ [activeKey]: r.active, [countKey]: r.count, ...(kind === "repost" && r.active ? { lastRepostBy: user } : {}) });
      if (kind === "repost" && r.active) toast.success("Di-repost ke profilmu.");
    } catch (e) {
      onChange(prev);
      toast.error(e.message);
    } finally {
      setBusy("");
    }
  };

  const share = async () => {
    const url = `${window.location.origin}/diskusi/${post._id}`;
    try {
      if (navigator.share) await navigator.share({ title: post.judul, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Tautan disalin.");
      }
    } catch {
      /* dibatalkan */
    }
  };

  const item = "group inline-flex items-center gap-1.5 rounded-full py-1 pr-2 text-sm transition-colors";
  const icon = "grid h-8 w-8 place-items-center rounded-full transition-colors";
  return (
    <div className={`flex items-center justify-between text-ink-mute ${className}`} onClick={(e) => e.stopPropagation()}>
      <Link to={`/diskusi/${post._id}#balasan`} className={`${item} hover:text-sky-600 dark:hover:text-sky-400`} aria-label={`Balas, ${post.balasanCount || 0} balasan`}>
        <span className={`${icon} group-hover:bg-sky-500/10`}>
          <MessageCircle size={18} />
        </span>
        {post.balasanCount || 0}
      </Link>
      <button onClick={() => toggle("repost")} className={`${item} ${post.repostedByMe ? "text-emerald-600 dark:text-emerald-400" : "hover:text-emerald-600 dark:hover:text-emerald-400"}`} aria-pressed={Boolean(post.repostedByMe)} aria-label="Repost">
        <span className={`${icon} group-hover:bg-emerald-500/10`}>
          <Repeat2 size={18} />
        </span>
        {post.repostCount || 0}
      </button>
      <button onClick={() => toggle("like")} className={`${item} ${post.likedByMe ? "text-rose-600 dark:text-rose-400" : "hover:text-rose-600 dark:hover:text-rose-400"}`} aria-pressed={Boolean(post.likedByMe)} aria-label="Suka">
        <span className={`${icon} group-hover:bg-rose-500/10`}>
          <Heart size={18} fill={post.likedByMe ? "currentColor" : "none"} />
        </span>
        {post.likeCount || 0}
      </button>
      <button onClick={share} className={`${item} hover:text-teal`} aria-label="Bagikan">
        <span className={`${icon} group-hover:bg-teal/10`}>
          <Share size={17} />
        </span>
      </button>
    </div>
  );
}
