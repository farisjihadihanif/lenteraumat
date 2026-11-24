import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpenText, FileQuestion, Heart, MessageCircle, PenSquare, ScrollText } from "lucide-react";
import { api } from "../lib/api";
import { BookCard } from "../components/BookGrid";
import { Avatar, Spinner } from "../components/ui";
import { displayName, timeAgo } from "../lib/format";
import heroBg from "../assets/Beranda/hero-perpustakaan.jpg";

// Judul hero "fixed" di dalam hero yang memakai mask: saat halaman digulir, hero naik
// sementara judul diam, sehingga judul tampak turun lalu tenggelam ke gradasi di bawah
// (teknik HNI & FJ Coffee). Paragraf ikut bergulir normal bersama hero.
const HERO_TITLE = "font-serif text-6xl font-semibold leading-none sm:text-7xl md:text-8xl";
const TAGLINE = "Lentera Umat Digital Library ~ read the book, discuss, summary and create a Quiz with Luma";

function Hero() {
  return (
    <section
      className="relative isolate -mt-16 h-svh min-h-[34rem] overflow-hidden bg-[rgb(var(--hero-bg))] text-white"
      style={{ WebkitMaskImage: "var(--hero-mask)", maskImage: "var(--hero-mask)" }}
    >
      <img src={heroBg} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover grayscale" />
      <div className="absolute inset-0 -z-10 bg-[color:var(--hero-scrim)]" aria-hidden />
      <h1 className={`fixed inset-x-0 top-[calc(50svh-5rem)] px-6 text-center [text-shadow:1px_1px_4px_rgba(0,0,0,.8)] ${HERO_TITLE}`}>Lentera Umat</h1>
      {/* Salinan judul tak terlihat menjaga jarak paragraf tepat di bawah judul. */}
      <div className="absolute inset-x-0 top-[calc(50svh-5rem)] px-6 text-center">
        <p className={`invisible ${HERO_TITLE}`} aria-hidden>
          Lentera Umat
        </p>
        <p className="mx-auto mt-6 max-w-2xl text-white/90 [text-shadow:1px_1px_3px_rgba(0,0,0,.8)] sm:text-lg">{TAGLINE}</p>
      </div>
      {/* Gradasi ke warna section berikutnya (latar Diskusi, ikut tema); judul yang turun tenggelam di sini. */}
      <div className="pointer-events-none absolute inset-x-0 -bottom-px z-10 h-[38%] bg-[image:var(--gradient-hero)]" aria-hidden />
    </section>
  );
}

const DISCUSSION_COUNT = 4;
const DISCUSSION_GRID = "grid gap-4 sm:grid-cols-2 lg:grid-cols-4";

function DiscussionCard({ post }) {
  return (
    <Link to={`/diskusi/${post._id}`} className="panel flex h-full min-w-0 flex-col p-5 transition-colors hover:border-ink/30">
      <span className="flex items-center gap-2.5">
        <Avatar user={post.author} size={32} />
        <span className="min-w-0 text-xs text-ink-mute">
          <span className="block truncate text-sm font-semibold text-ink">{displayName(post.author)}</span>
          <time dateTime={post.createdAt}>{timeAgo(post.createdAt)}</time>
        </span>
      </span>
      <h3 className="mt-4 line-clamp-2 break-words font-semibold leading-snug">{post.judul}</h3>
      <p className="mt-1.5 line-clamp-3 break-words text-sm leading-relaxed text-ink-soft">{post.cuplikan}</p>
      <span className="mt-auto flex items-center gap-4 pt-4 text-sm text-ink-mute">
        <span className="inline-flex items-center gap-1.5">
          <Heart size={16} aria-hidden /> {post.likeCount || 0}
          <span className="sr-only">suka</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MessageCircle size={16} aria-hidden /> {post.balasanCount || 0}
          <span className="sr-only">komentar</span>
        </span>
      </span>
    </Link>
  );
}

function DiscussionSkeleton() {
  return (
    <div role="status">
      <span className="sr-only">Memuat diskusi…</span>
      <div className={DISCUSSION_GRID} aria-hidden>
        {Array.from({ length: DISCUSSION_COUNT }, (_, i) => (
          <div key={i} className="panel h-56 animate-pulse p-5">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-line" />
              <div className="h-3 w-24 rounded bg-line" />
            </div>
            <div className="mt-5 h-4 w-4/5 rounded bg-line" />
            <div className="mt-4 h-3 rounded bg-line" />
            <div className="mt-2.5 h-3 rounded bg-line" />
            <div className="mt-2.5 h-3 w-3/5 rounded bg-line" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Tamu yang menekan "Mulai diskusi" diarahkan ke halaman masuk oleh RequireAuth.
function StartDiscussion() {
  return (
    <Link to="/diskusi/baru" className="btn-primary shrink-0">
      <PenSquare size={16} /> Mulai diskusi
    </Link>
  );
}

function DiscussionSection() {
  const [items, setItems] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    api
      .get(`/discussions?sort=terbaru&limit=${DISCUSSION_COUNT}`)
      .then((r) => setItems(r.items))
      .catch(() => setFailed(true));
  }, []);

  return (
    <section className="relative bg-mist py-16 sm:py-20">
      <div className="container-page">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-serif text-3xl font-semibold sm:text-4xl">Diskusi</h2>
          {items?.length !== 0 && <StartDiscussion />}
        </div>
        {failed ? (
          <p className="panel p-8 text-center text-ink-soft">Diskusi belum bisa dimuat. Coba lagi nanti.</p>
        ) : !items ? (
          <DiscussionSkeleton />
        ) : items.length === 0 ? (
          <div className="panel p-8 text-center">
            <p className="mb-4 font-semibold">Belum ada diskusi.</p>
            <StartDiscussion />
          </div>
        ) : (
          <ul className={DISCUSSION_GRID}>
            {items.map((p) => (
              <li key={p._id} className="min-w-0">
                <DiscussionCard post={p} />
              </li>
            ))}
          </ul>
        )}
        {(failed || items?.length > 0) && (
          <div className="mt-12 text-center">
            <Link to="/diskusi" className="btn-outline px-6">
              Lihat semua diskusi
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

// Banyak kolom per lebar layar, supaya selalu tepat 3 baris.
const VISIBLE = [
  [6, ""],
  [9, "hidden sm:block"],
  [12, "hidden md:block"],
  [18, "hidden lg:block"],
];
const visibility = (i) => VISIBLE.find(([n]) => i < n)?.[1] ?? "hidden";

function LibrarySection() {
  const [data, setData] = useState(null);
  useEffect(() => {
    api
      .get("/books?sort=terbaru&limit=18")
      .then(setData)
      .catch(() => setData({ items: [], total: 0 }));
  }, []);

  return (
    <section className="relative bg-mist py-16 sm:py-20">
      <div className="container-page">
        <h2 className="mb-8 font-serif text-3xl font-semibold sm:text-4xl">Library</h2>
        {!data ? (
          <Spinner />
        ) : data.total === 0 ? (
          <div className="panel p-8 text-center">
            <p className="font-semibold">Belum ada buku di Library.</p>
            <Link to="/unggah" className="btn-primary mt-4">
              Unggah buku
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {data.items.map((b, i) => (
                <div key={b._id} className={visibility(i)}>
                  <BookCard book={b} />
                </div>
              ))}
            </div>
            {data.total > 6 && (
              <div className="mt-12 text-center">
                <Link to="/buku" className="btn-outline px-6">
                  More books
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

const LUMA_FEATURES = [
  { mode: "chat", icon: MessageCircle, title: "Tanya apa saja", text: "Pelajaran, ibadah, atau topik yang sedang kamu pelajari. Bisa sambil kirim foto, PDF, atau video." },
  { mode: "ask", icon: BookOpenText, title: "Tanya isi buku", text: "Pilih buku dari Library, lalu tanyakan bagian yang belum jelas. LUMA menyebut halamannya." },
  { mode: "summary", icon: ScrollText, title: "Ringkasan", text: "Gambaran isi buku sebelum kamu membacanya, atau pengingat setelah selesai." },
  { mode: "quiz", icon: FileQuestion, title: "Kuis", text: "Latihan soal dengan nilai otomatis, atau lembar soal lengkap dengan kunci jawaban untuk guru." },
];

function LumaSection() {
  return (
    <section className="relative bg-forest py-16 text-white sm:py-20">
      <div className="container-page">
        <h2 className="text-center font-serif text-3xl font-semibold sm:text-4xl">Mari Belajar bersama LUMA</h2>
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LUMA_FEATURES.map(({ mode, icon: Icon, title, text }) => (
            <li key={mode}>
              <Link to={`/luma?mode=${mode}`} className="block h-full rounded-xl border border-white/15 p-5 transition-colors hover:border-white/40 hover:bg-white/5">
                <Icon size={24} className="text-lamp" />
                <p className="mt-4 text-lg font-bold">{title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-white/85">{text}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <>
      <Hero />
      <DiscussionSection />
      <LumaSection />
      <LibrarySection />
    </>
  );
}
