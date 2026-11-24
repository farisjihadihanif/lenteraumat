import { Suspense, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { BookOpen, Github, Home, Instagram, Library, Linkedin, LogOut, MessagesSquare, Moon, Search, Settings, Shield, Sparkles, Sun, Upload, User, UserPlus } from "lucide-react";
import { useAuth } from "../context/Auth";
import { Avatar, PageLoader } from "./ui";
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
    const root = document.documentElement;
    root.classList.add("theme-switching");
    root.classList.toggle("dark", next);
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
    try {
      localStorage.setItem("lenteraumat_theme", next ? "dark" : "light");
    } catch {
      /* penyimpanan tidak tersedia */
    }
    setDark(next);
  };
  const label = dark ? "Switch to light mode" : "Switch to dark mode";
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
    { to: "/rak", label: "My Shelf", icon: BookOpen },
    { to: "/unggah", label: "Upload book", icon: Upload },
    { to: `/profil/${user.username}`, label: "Profile", icon: User },
    { to: "/pengaturan", label: "Settings", icon: Settings },
    ...(isAdmin ? [{ to: "/admin", label: "Admin dashboard", icon: Shield }] : []),
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
      <button onClick={() => setOpen((v) => !v)} className="block shrink-0 rounded-full ring-offset-2 ring-offset-surface hover:ring-2 hover:ring-line" aria-expanded={open} aria-haspopup="menu" aria-label="Account menu">
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
            <p className="px-3 pb-1 pt-2 text-xs font-semibold text-ink-mute">Switch account</p>
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
              <UserPlus size={16} className="text-ink-mute" /> Add account
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
            <LogOut size={16} /> Sign out of @{user.username}
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
      <input value={q} onChange={(e) => setQ(e.target.value)} className="field rounded-full bg-mist/80 py-2 pl-10" placeholder="Search title or author" aria-label="Search books" />
    </form>
  );
}

export function Navbar() {
  const { user, ready } = useAuth();
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-surface/80 backdrop-blur-md">
      <div className="container-page flex h-16 items-center gap-2 sm:gap-4 lg:grid lg:grid-cols-[minmax(max-content,1fr)_minmax(0,26rem)_minmax(max-content,1fr)]">
        <Link to="/" className="shrink-0 justify-self-start" aria-label="LenteraUmat, go to Home">
          <img src={logoColor} alt="LenteraUmat" className="h-11 w-auto dark:hidden" />
          <img src={logoLight} alt="LenteraUmat" className="hidden h-11 w-auto dark:block" />
        </Link>
        <SearchBox className="hidden w-full min-w-0 md:block lg:justify-self-center" />
        <div className="ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap lg:justify-self-end">
          <nav className="mr-2 hidden items-center md:flex" aria-label="Main">
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
                  Sign in
                </Link>
                <Link to="/daftar" className="btn-primary btn-sm">
                  Sign up
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
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Bottom navigation">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${isActive ? "text-teal" : "text-ink-mute"}`}>
          <Icon size={20} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

const SOSIAL = [
  { href: "https://www.instagram.com/farisjihadihanif/", label: "Instagram Faris Jihadi Hanif Lubis", icon: Instagram },
  { href: "https://github.com/farisjihadihanif", label: "GitHub Faris", icon: Github },
  { href: "https://www.linkedin.com/in/faris-jihadi-hanif-lubis-62337a286/", label: "LinkedIn Faris", icon: Linkedin },
];

function Footer({ flush }) {
  return (
    <footer className={`${flush ? "" : "mt-20"} bg-night pb-16 text-white/70 md:pb-0`}>
      {/* Kiri: pembuat · Tengah: nama aplikasi · Kanan: halaman informasi */}
      <div className="container-page grid items-center gap-1.5 py-3 text-center text-xs md:grid-cols-3 md:gap-6">
        <span className="flex items-center justify-center gap-1.5 md:justify-start">
          Created by
          {SOSIAL.map(({ href, label, icon: Icon }) => (
            <a key={href} href={href} target="_blank" rel="noopener noreferrer" className="shrink-0 text-white/80 hover:text-white" aria-label={label}>
              <Icon size={15} />
            </a>
          ))}
          Faris Jihadi Hanif Lubis
        </span>
        <span>LenteraUmat © {new Date().getFullYear()}</span>
        <nav className="flex justify-center gap-4 md:justify-end" aria-label="Information">
          <Link to="/ketentuan" className="hover:text-white">Terms</Link>
          <Link to="/privasi" className="hover:text-white">Privacy</Link>
          <Link to="/hak-cipta" className="hover:text-white">Copyright</Link>
        </nav>
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
        {/* key = halaman: tiap pindah halaman, isinya masuk dengan animasi singkat */}
        <div key={pathname} className="page-enter">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
      <Footer flush={home} />
      <MobileNav />
      <FloatingLuma />
    </div>
  );
}
