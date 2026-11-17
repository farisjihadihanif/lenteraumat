import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { BookOpen, Home, Instagram, Library, LogOut, MessagesSquare, Search, Settings, Shield, Sparkles, Upload, User, ChevronDown } from "lucide-react";
import { useAuth } from "../context/Auth";
import { Avatar } from "./ui";
import FloatingLuma from "./FloatingLuma";
import { displayName } from "../lib/format";
import logo from "../assets/Navbar/lenteraumatwarna.svg";

const NAV = [
  { to: "/", label: "Beranda", icon: Home, end: true },
  { to: "/buku", label: "Library", icon: Library },
  { to: "/luma", label: "LUMA", icon: Sparkles },
  { to: "/diskusi", label: "Diskusi", icon: MessagesSquare },
];

function UserMenu() {
  const { user, logout, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const items = [
    { to: "/rak", label: "Rak saya", icon: BookOpen },
    { to: "/unggah", label: "Unggah buku", icon: Upload },
    { to: `/profil/${user.username}`, label: "Profil", icon: User },
    { to: "/pengaturan", label: "Pengaturan", icon: Settings },
    ...(isAdmin ? [{ to: "/admin", label: "Dasbor admin", icon: Shield }] : []),
  ];
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 rounded-full p-1 pr-2 hover:bg-ink/5" aria-expanded={open} aria-haspopup="menu">
        <Avatar user={user} size={32} />
        <ChevronDown size={16} className="text-ink-mute" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-40 w-60 rounded-xl border border-line bg-white p-1.5 shadow-lift">
          <div className="border-b border-line px-3 pb-2.5 pt-1.5">
            <p className="truncate text-sm font-bold">{displayName(user)}</p>
            <p className="truncate text-xs text-ink-mute">@{user.username}{isAdmin && " · admin"}</p>
          </div>
          <div className="py-1">
            {items.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} role="menuitem" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-mist">
                <Icon size={16} className="text-ink-mute" /> {label}
              </Link>
            ))}
          </div>
          <button
            role="menuitem"
            onClick={async () => {
              await logout();
              navigate("/");
            }}
            className="flex w-full items-center gap-3 rounded-lg border-t border-line px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            <LogOut size={16} /> Keluar
          </button>
        </div>
      )}
    </div>
  );
}

function SearchBox({ className = "" }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      className={`relative ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        navigate(`/buku?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
      <input value={q} onChange={(e) => setQ(e.target.value)} className="field rounded-full bg-mist py-2 pl-9" placeholder="Cari judul atau penulis" aria-label="Cari buku" />
    </form>
  );
}

export function Navbar() {
  const { user, ready } = useAuth();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
      <div className="container-page flex h-16 items-center gap-6">
        <Link to="/" className="shrink-0" aria-label="LenteraUmat, ke beranda">
          <img src={logo} alt="LenteraUmat" className="h-11 w-auto" />
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Utama">
          {NAV.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? "text-teal" : "text-ink-soft hover:text-ink"}`}
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <SearchBox className="ml-auto hidden w-64 lg:block" />
        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          {ready &&
            (user ? (
              <>
                <Link to="/unggah" className="btn-outline btn-sm hidden sm:inline-flex">
                  <Upload size={14} /> Unggah
                </Link>
                <UserMenu />
              </>
            ) : (
              <>
                <Link to="/masuk" className="btn-ghost btn-sm">
                  Masuk
                </Link>
                <Link to="/daftar" className="btn-primary btn-sm">
                  Daftar
                </Link>
              </>
            ))}
        </div>
      </div>
    </header>
  );
}

function MobileNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Navigasi bawah">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${isActive ? "text-teal" : "text-ink-mute"}`}>
          <Icon size={20} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function Footer() {
  return (
    <footer className="mt-20 bg-ink pb-16 text-white/70 md:pb-0">
      <div className="container-page flex flex-col items-center justify-center gap-1.5 py-3 text-xs sm:flex-row sm:gap-3">
        <span>Lentera Umat © 2025</span>
        <span className="hidden sm:inline" aria-hidden>·</span>
        <span className="flex items-center gap-2">
          Created by Faris Jihadi Hanif Lubis
          <a href="https://www.instagram.com/farisjihadihanif/" target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-white" aria-label="Instagram Faris Jihadi Hanif Lubis">
            <Instagram size={15} />
          </a>
        </span>
      </div>
    </footer>
  );
}

export default function Layout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1 pb-16 md:pb-0">
        <Outlet />
      </main>
      <Footer />
      <MobileNav />
      <FloatingLuma />
    </div>
  );
}
