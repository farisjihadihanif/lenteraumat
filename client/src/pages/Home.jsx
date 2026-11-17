import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpenText, FileQuestion, MessageCircle, ScrollText } from "lucide-react";
import { api } from "../lib/api";
import { BookCard } from "../components/BookGrid";
import { Spinner } from "../components/ui";
import heroBg from "../assets/Beranda/hero-perpustakaan.jpg";

// Judul hero "fixed" di dalam hero yang memakai mask: saat halaman digulir, hero naik
// sementara judul diam, sehingga judul tampak turun lalu tenggelam ke gradasi hijau di bawah
// (teknik HNI & FJ Coffee). Paragraf ikut bergulir normal bersama hero.
const HERO_TITLE = "font-serif text-6xl font-semibold leading-none sm:text-7xl md:text-8xl";
const TAGLINE = "Lentera Umat Digital Library ~ read the book, discuss, summary and create a Quiz with Luma";

function Hero() {
  return (
    <section
      className="relative isolate -mt-16 h-svh min-h-[34rem] overflow-hidden bg-neutral-900 text-white"
      style={{ WebkitMaskImage: "linear-gradient(#000, #000)", maskImage: "linear-gradient(#000, #000)" }}
    >
      <img src={heroBg} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover grayscale" />
      <div className="absolute inset-0 -z-10 bg-black/60" aria-hidden />
      <h1 className={`fixed inset-x-0 top-[calc(50svh-5rem)] px-6 text-center [text-shadow:1px_1px_4px_rgba(0,0,0,.8)] ${HERO_TITLE}`}>Lentera Umat</h1>
      {/* Salinan judul tak terlihat menjaga jarak paragraf tepat di bawah judul. */}
      <div className="absolute inset-x-0 top-[calc(50svh-5rem)] px-6 text-center">
        <p className={`invisible ${HERO_TITLE}`} aria-hidden>
          Lentera Umat
        </p>
        <p className="mx-auto mt-6 max-w-2xl text-white/90 [text-shadow:1px_1px_3px_rgba(0,0,0,.8)] sm:text-lg">{TAGLINE}</p>
      </div>
      {/* Gradasi ke warna section berikutnya (hijau LUMA); judul yang turun tenggelam di sini. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[38%] bg-gradient-to-b from-transparent via-forest/70 to-forest" aria-hidden />
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
    <section className="relative bg-forest pb-16 pt-6 text-white sm:pb-24 sm:pt-10">
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
      <LumaSection />
      <LibrarySection />
    </>
  );
}
