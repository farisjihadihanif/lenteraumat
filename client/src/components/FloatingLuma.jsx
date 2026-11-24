import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import luma from "../assets/Maskot/luma-wave.webp";

const PHONE = "(max-width: 767px)";

// Di HP: maskot menyingkir selama halaman digulir, dan tetap menyingkir bila
// posisinya akan menutupi tombol.
function useTuckedAway(el, pathname) {
  const [tucked, setTucked] = useState(false);
  useEffect(() => {
    if (!el) return;
    const phone = window.matchMedia(PHONE);
    let timer;
    const settle = () => {
      const a = el.getBoundingClientRect();
      const covers = [...document.querySelectorAll('main [class*="btn-"]')].some((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.left < a.right && r.right > a.left && r.top < a.bottom && r.bottom > a.top;
      });
      setTucked(phone.matches && covers);
    };
    const wait = (ms) => {
      clearTimeout(timer);
      timer = setTimeout(settle, ms);
    };
    const onScroll = () => {
      if (!phone.matches) return;
      setTucked(true);
      wait(300);
    };
    const onResize = () => wait(100);
    // Isi yang baru selesai dimuat juga bisa menggeser tombol ke bawah maskot.
    const size = "ResizeObserver" in window ? new ResizeObserver(onResize) : null;
    size?.observe(document.body);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    wait(400);
    return () => {
      clearTimeout(timer);
      size?.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [el, pathname]);
  return tucked;
}

// Maskot LUMA melayang di kanan bawah. Diklik -> halaman chat LUMA.
export default function FloatingLuma() {
  const { pathname } = useLocation();
  const [el, setEl] = useState(null);
  const tucked = useTuckedAway(el, pathname);
  if (pathname.startsWith("/luma")) return null;
  return (
    <Link
      ref={setEl}
      to="/luma"
      aria-label="Ask LUMA"
      className={`group fixed bottom-20 right-3 z-40 flex flex-col items-center transition-opacity duration-200 md:bottom-5 md:right-10 ${
        tucked ? "max-md:pointer-events-none max-md:opacity-0 max-md:focus-visible:opacity-100" : ""
      }`}
    >
      <span className="pointer-events-none absolute bottom-full right-0 mb-1 whitespace-nowrap rounded-md bg-lantern px-3 py-1 text-sm font-bold text-[#1B2B3A] opacity-0 shadow-lift transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 md:static">
        Ask LUMA
      </span>
      <img src={luma} alt="" className="h-auto w-14 drop-shadow-lg transition-transform duration-300 ease-in-out group-hover:scale-110 md:w-24" />
    </Link>
  );
}
