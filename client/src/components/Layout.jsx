import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { BookOpen, Home, Instagram, Library, LogOut, MessagesSquare, Moon, Search, Settings, Shield, Sparkles, Sun, Upload, User, UserPlus } from "lucide-react";
import { useAuth } from "../context/Auth";
import { Avatar } from "./ui";
import FloatingLuma from "./FloatingLuma";
import { displayName } from "../lib/format";
import logoColor from "../assets/Navbar/lenteraumatwarna.svg";
import logoLight from "../assets/Navbar/lenteraumat.svg";

const NAV = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/buku", label: "Library", icon: Library },
  { to: "/luma", label: "LUMA", icon: Sparkles },
  { to: "/diskusi", label: "Discussion", icon: MessagesSquare },
];

// Mode terang/gelap. Ikon: matahari saat terang, bulan saat gelap (seperti project HNI).
function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* penyimpanan tidak tersedia */
    }
    setDark(next);
  };
  const label = dark ? "Ganti ke mode terang" : "Ganti ke mode gelap";
  return (
    <button onClick={toggle} className="rounded-full p-2 text-ink-soft hover:bg-ink/5 hover:text-ink" aria-label={label} title={label}>
      {dark ? <Moon size={19} /> : <Sun size={19} />}
    </button>
  );
}

function UserMenu() {
  const { user, logout, isAdmin, accounts, switchAccount } = useAuth();
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

  const others = accounts.filter((a) => !a.current);
  const items = [
    { to: "/rak", label: "Rak saya", icon: BookOpen },
    { to: "/unggah", label: "Unggah buku", icon: Upload },
    { to: `/profil/${user.username}`, label: "Profil", icon: User },
    { to: "/pengaturan", label: "Pengaturan", icon: Settings },
    ...(isAdmin ? [{ to: "/admin", label: "Dasbor admin", icon: Shield }] : []),
  ];
  const doSwitch = async (a) => {
    try {
      await switchAccount(a._id);
      setOpen(false);
      toast.success(`Sekarang masuk sebagai ${displayName(a)}.`);
    } catch (e) {
      toast.error(e.message);
      navigate(`/masuk?tambah=1`);
    }
  };
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} className="block rounded-full ring-offset-2 ring-offset-surface hover:ring-2 hover:ring-line" aria-expanded={open} aria-haspopup="menu" aria-label="Menu akun">
        <Avatar user={user} size={34} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-40 w-64 rounded-xl border border-line bg-surface p-1.5 shadow-lift">
          <div className="flex items-center gap-3 border-b border-line px-3 pb-3 pt-2">
            <Avatar user={user} size={36} />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{displayName(user)}</p>
              <p className="truncate text-xs text-ink-mute">
                @{user.username}
                {isAdmin && <span className="ml-1.5 rounded bg-night px-1 py-px text-[10px] font-bold text-white">admin</span>}
              </p>
            </div>
          </div>
          <div className="py-1">
            {items.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} role="menuitem" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-mist">
                <Icon size={16} className="text-ink-mute" /> {label}
              </Link>
            ))}
          </div>
          <div className="border-t border-line py-1">
            <p className="px-3 pb-1 pt-2 text-xs font-semibold text-ink-mute">Ganti akun</p>
            {others.map((a) => (
              <button key={a._id} role="menuitem" onClick={() => doSwitch(a)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-mist">
                <Avatar user={a} size={24} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{displayName(a)}</span>
                  <span className="block truncate text-xs text-ink-mute">@{a.username}</span>
                </span>
              </button>
            ))}
            <Link to="/masuk?tambah=1" role="menuitem" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-mist">
              <UserPlus size={16} className="text-ink-mute" /> Tambah akun
            </Link>
          </div>
          <button
            role="menuitem"
            onClick={async () => {
              await logout();
              navigate("/");
            }}
            className="flex w-full items-center gap-3 rounded-lg border-t border-line px-3 py-2 text-sm text-danger hover:bg-red-500/10 dark:text-red-400"
          >
            <LogOut size={16} /> Keluar dari @{user.username}
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
      <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-mute" />
      <input value={q} onChange={(e) => setQ(e.target.value)} className="field rounded-full bg-mist/80 py-2 pl-10" placeholder="Cari judul atau penulis" aria-label="Cari buku" />
    </form>
  );
}

export function Navbar() {
  const { user, ready } = useAuth();
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-surface/80 backdrop-blur-md">
      <div className="container-page flex h-16 items-center gap-4 lg:grid lg:grid-cols-[1fr_minmax(0,26rem)_1fr]">
        <Link to="/" className="shrink-0 justify-self-start" aria-label="Lentera Umat, ke Home">
          <img src={logoColor} alt="Lentera Umat" className="h-11 w-auto dark:hidden" />
          <img src={logoLight} alt="Lentera Umat" className="hidden h-11 w-auto dark:block" />
        </Link>
        <SearchBox className="hidden w-full md:block lg:justify-self-center" />
        <div className="ml-auto flex items-center gap-1 lg:justify-self-end">
          <nav className="mr-2 hidden items-center md:flex" aria-label="Utama">
            {NAV.map(({ to, label, end }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => `rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? "text-teal" : "text-ink-soft hover:text-ink"}`}>
                {label}
              </NavLink>
            ))}
          </nav>
          <ThemeToggle />
          {ready &&
            (user ? (
              <div className="ml-1">
                <UserMenu />
              </div>
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
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Navigasi bawah">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${isActive ? "text-teal" : "text-ink-mute"}`}>
          <Icon size={20} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function Footer({ flush }) {
  return (
    <footer className={`${flush ? "" : "mt-20"} bg-night pb-16 text-white/70 md:pb-0`}>
      <div className="container-page flex flex-col items-center justify-center gap-1.5 py-3 text-xs sm:flex-row sm:gap-6">
        <span>Lentera Umat © 2025</span>
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
  const home = pathname === "/";
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1 pb-16 md:pb-0">
        <Outlet />
      </main>
      <Footer flush={home} />
      <MobileNav />
      <FloatingLuma />
    </div>
  );
}
