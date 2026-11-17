import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpenText, FileQuestion, MessageCircle, ScrollText } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/Auth";
import { BookRow } from "../components/BookGrid";
import BookCover from "../components/BookCover";
import { Spinner, Avatar, UserLink } from "../components/ui";
import { timeAgo } from "../lib/format";
import heroBg from "../assets/Beranda/hero-perpustakaan.jpg";

function Section({ title, link, children }) {
  return (
    <section className="container-page mt-14">
      <div className="mb-5 flex items-end justify-between gap-4">
        <h2 className="text-xl font-bold sm:text-2xl">{title}</h2>
        {link && (
          <Link to={link} className="shrink-0 text-sm font-semibold text-teal hover:underline">
            Lihat semua
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Hero() {
  return (
    <section
      className="relative isolate -mt-16 overflow-hidden bg-neutral-900 text-white"
      style={{ WebkitMaskImage: "linear-gradient(#000 85%, transparent)", maskImage: "linear-gradient(#000 85%, transparent)" }}
    >
      <img src={heroBg} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover grayscale" />
      <div className="absolute inset-0 -z-10 bg-black/65" aria-hidden />
      <div className="container-page flex min-h-svh flex-col items-center justify-center pb-16 pt-28 text-center">
        <h1 className="font-serif text-6xl font-semibold leading-none [text-shadow:1px_1px_4px_rgba(0,0,0,.8)] sm:text-7xl md:text-8xl">Lentera Umat</h1>
        <p className="mt-6 max-w-2xl text-white/90 [text-shadow:1px_1px_3px_rgba(0,0,0,.8)] sm:text-lg">
          Lentera Umat Digital Library ~ read the book, discuss, summary and create a Quiz with Luma
        </p>
      </div>
    </section>
  );
}

const LUMA_FEATURES = [
  { mode: "chat", icon: MessageCircle, title: "Tanya apa saja", text: "Ngobrol tentang pelajaran, ibadah, atau topik yang sedang kamu pelajari." },
  { mode: "ask", icon: BookOpenText, title: "Tanya isi buku", text: "Pilih buku, lalu tanyakan bagian yang belum kamu pahami. LUMA menyebut halamannya." },
  { mode: "summary", icon: ScrollText, title: "Ringkasan", text: "Dapatkan gambaran isi buku sebelum atau sesudah membacanya." },
  { mode: "quiz", icon: FileQuestion, title: "Kuis", text: "Uji pemahamanmu dengan soal pilihan ganda atau isian dari buku." },
];

export default function Home() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [cont, setCont] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get("/books?sort=terbaru&limit=12"),
      api.get("/books?sort=populer&limit=12"),
      api.get("/books?sort=rating&limit=12"),
      api.get("/books/categories"),
      api.get("/discussions?sort=aktif&limit=4"),
    ])
      .then(([baru, populer, rating, cats, disk]) =>
        setData({ baru: baru.items, populer: populer.items, rating: rating.items.filter((b) => b.ratingCount > 0), total: baru.total, cats: cats.categories, disk: disk.items }),
      )
      .catch(() => setData({ baru: [], populer: [], rating: [], cats: [], disk: [], total: 0 }));
  }, []);

  useEffect(() => {
    if (user) api.get("/books/continue").then((r) => setCont(r.items)).catch(() => {});
    else setCont([]);
  }, [user]);

  return (
    <>
      <Hero />

      {cont.length > 0 && (
        <Section title="Lanjut membaca" link="/rak">
          <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            {cont.slice(0, 6).map(({ book, page, totalPages }) => (
              <Link key={book._id} to={`/buku/${book._id}/baca`} className="flex w-72 shrink-0 snap-start gap-4 rounded-xl border border-line bg-surface p-3 hover:border-teal/40">
                <div className="w-16 shrink-0">
                  <BookCover book={book} />
                </div>
                <div className="min-w-0 flex-1 py-1">
                  <p className="book-title line-clamp-2 text-sm">{book.judul}</p>
                  <p className="mt-1 text-xs text-ink-mute">
                    Halaman {page}
                    {totalPages ? ` dari ${totalPages}` : ""}
                  </p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-mist">
                    <div className="h-full rounded-full bg-lantern" style={{ width: `${totalPages ? Math.min(100, (page / totalPages) * 100) : 5}%` }} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {!data ? (
        <div className="container-page py-16">
          <Spinner />
        </div>
      ) : data.total === 0 ? (
        <section className="container-page mt-14">
          <div className="panel p-8 text-center">
            <p className="font-semibold">Rak masih kosong.</p>
            <p className="mt-1 text-sm text-ink-mute">Jadilah yang pertama menyumbang buku ke perpustakaan ini.</p>
            <Link to="/unggah" className="btn-primary mt-4">
              Unggah buku
            </Link>
          </div>
        </section>
      ) : (
        <>
          <Section title="Baru ditambahkan" link="/buku">
            <BookRow books={data.baru} />
          </Section>
          {data.populer.some((b) => b.dibaca > 0) && (
            <Section title="Paling banyak dibaca" link="/buku?sort=populer">
              <BookRow books={data.populer} />
            </Section>
          )}
          {data.rating.length > 2 && (
            <Section title="Rating tertinggi" link="/buku?sort=rating">
              <BookRow books={data.rating} />
            </Section>
          )}
        </>
      )}

      {/* Section 3: LUMA */}
      <section className="container-page mt-16">
        <div className="grid gap-8 rounded-2xl bg-teal p-6 text-white sm:p-10 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 className="font-serif text-3xl font-semibold">Belajar bersama LUMA</h2>
            <p className="mt-3 text-white/80">LUMA adalah teman belajar berbasis AI di LenteraUmat. Ia membaca buku di perpustakaan ini supaya bisa menjawab pertanyaanmu tentang isinya.</p>
            <Link to="/luma" className="btn mt-6 bg-white text-[#316B6C] hover:bg-white/90">
              Ngobrol dengan LUMA <ArrowRight size={16} />
            </Link>
          </div>
          <ul className="grid gap-5 sm:grid-cols-2">
            {LUMA_FEATURES.map(({ mode, icon: Icon, title, text }) => (
              <li key={title}>
                <Link to={`/luma?mode=${mode}`} className="group -m-3 flex gap-3 rounded-xl p-3 transition-colors hover:bg-white/10">
                  <Icon size={22} className="mt-0.5 shrink-0 text-lamp" />
                  <div>
                    <p className="flex items-center gap-1.5 font-bold">
                      {title} <ArrowRight size={14} className="opacity-0 transition-opacity group-hover:opacity-100" />
                    </p>
                    <p className="mt-1 text-sm text-white/75">{text}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
      {data?.total > 0 && (
        <>
          <Section title="Kategori">
            <div className="flex flex-wrap gap-2">
              {data.cats
                .filter((c) => c.count > 0)
                .map((c) => (
                  <Link key={c.name} to={`/buku?kategori=${encodeURIComponent(c.name)}`} className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold hover:border-teal hover:text-teal">
                    {c.name} <span className="ml-1 font-normal text-ink-mute">{c.count}</span>
                  </Link>
                ))}
            </div>
          </Section>
        </>
      )}

      {data?.disk?.length > 0 && (
        <Section title="Diskusi terbaru" link="/diskusi">
          <div className="grid gap-4 md:grid-cols-2">
            {data.disk.map((d) => (
              <Link key={d._id} to={`/diskusi/${d._id}`} className="panel block p-5 hover:border-teal/40">
                {d.book && <p className="mb-1 truncate text-xs font-semibold text-teal">Tentang: {d.book.judul}</p>}
                <p className="font-bold">{d.judul}</p>
                <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{d.cuplikan}</p>
                <div className="mt-3 flex items-center gap-2 text-xs text-ink-mute">
                  <Avatar user={d.author} size={20} />
                  <UserLink user={d.author} className="text-ink-soft" /> · {timeAgo(d.createdAt)} · {d.balasanCount} balasan
                </div>
              </Link>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
