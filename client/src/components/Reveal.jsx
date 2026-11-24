import { useEffect, useRef } from "react";

// Animasi masuk sekali saat elemen memasuki layar. Elemen baru disembunyikan setelah observer
// memastikan posisinya di bawah layar, jadi isi tetap terlihat tanpa JS dan layar pertama tidak
// pernah kosong. Jeda berurutan dihitung dari baris & kolom elemen yang masuk bersamaan.
const STEP = 80;
const MAX_DELAY = 480;
// Margin atas sangat besar: elemen yang terlewati (gulir cepat) langsung dianggap masuk.
const MARGIN = "100000px 0px -40px 0px";
let observer;

function show(entries) {
  const rows = new Map();
  for (const e of entries) {
    const key = Math.round(e.boundingClientRect.top / 4);
    rows.set(key, [...(rows.get(key) || []), e]);
  }
  [...rows.keys()]
    .sort((a, b) => a - b)
    .forEach((key, r) => {
      rows
        .get(key)
        .sort((a, b) => a.boundingClientRect.left - b.boundingClientRect.left)
        .forEach(({ target }, c) => {
          target.style.animationDelay = `${Math.min((r + c) * STEP, MAX_DELAY)}ms`;
          target.dataset.reveal = "in";
        });
    });
}

function onIntersect(entries) {
  const entering = [];
  for (const e of entries) {
    const el = e.target;
    if (e.isIntersecting) {
      observer.unobserve(el);
      if (el.dataset.reveal === "wait") entering.push(e);
    } else if (!el.dataset.reveal) {
      // Laporan pertama: sembunyikan hanya bila seluruhnya di bawah layar.
      if (e.boundingClientRect.top >= window.innerHeight) el.dataset.reveal = "wait";
      else observer.unobserve(el);
    }
  }
  show(entering);
}

// variant: "rise" (naik 16px) · "book" (sampul diletakkan di rak) · "side" (masuk dari samping)
export default function Reveal({ as: Tag = "div", variant = "rise", className = "", ...props }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    observer ??= new IntersectionObserver(onIntersect, { rootMargin: MARGIN });
    const done = (e) => {
      if (e.target !== el) return;
      delete el.dataset.reveal;
      el.style.animationDelay = "";
    };
    el.addEventListener("animationend", done);
    observer.observe(el);
    return () => {
      observer.unobserve(el);
      el.removeEventListener("animationend", done);
      delete el.dataset.reveal;
    };
  }, []);
  return <Tag ref={ref} className={`reveal-${variant} ${className}`} {...props} />;
}
