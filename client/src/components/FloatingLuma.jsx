import { Link, useLocation } from "react-router-dom";
import luma from "../assets/Maskot/luma-wave.webp";

// Maskot LUMA melayang di kanan bawah. Diklik -> halaman chat LUMA.
export default function FloatingLuma() {
  const { pathname } = useLocation();
  if (pathname.startsWith("/luma")) return null;
  return (
    <Link
      to="/luma"
      aria-label="Tanya LUMA"
      className="group fixed bottom-20 right-3 z-40 flex flex-col items-center md:bottom-5 md:right-10"
    >
      <span className="pointer-events-none mb-1 whitespace-nowrap rounded-md bg-lantern px-3 py-1 text-sm font-bold text-white opacity-0 shadow-lift transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
        Tanya LUMA
      </span>
      <img src={luma} alt="" className="h-auto w-20 drop-shadow-lg transition-transform duration-300 ease-in-out group-hover:scale-110 md:w-24" />
    </Link>
  );
}
