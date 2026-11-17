import { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Modal } from "./ui";

const VIEW = 280; // ukuran bingkai di layar (px)
const OUT = 512; // ukuran foto hasil (px)

// Atur posisi & zoom foto profil: geser foto, perbesar/perkecil, lalu simpan sebagai JPEG persegi.
export default function AvatarCropper({ file, onCancel, onDone }) {
  const [img, setImg] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef(null);

  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => {
      setImg(el);
      setZoom(1);
      setPos({ x: 0, y: 0 });
    };
    el.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Skala dasar: sisi terpendek foto pas menutupi bingkai.
  const base = img ? VIEW / Math.min(img.width, img.height) : 1;
  const w = img ? img.width * base * zoom : 0;
  const h = img ? img.height * base * zoom : 0;
  const clamp = (p, z = zoom) => {
    const mx = Math.max(0, (img.width * base * z - VIEW) / 2);
    const my = Math.max(0, (img.height * base * z - VIEW) / 2);
    return { x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)) };
  };
  const setZoomClamped = (z) => {
    const nz = Math.min(4, Math.max(1, z));
    setZoom(nz);
    setPos((p) => clamp(p, nz));
  };

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, ...pos };
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const d = drag.current;
    setPos(clamp({ x: d.x + e.clientX - d.sx, y: d.y + e.clientY - d.sy }));
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onKey = (e) => {
    const step = 10;
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) {
      e.preventDefault();
      setPos((p) => clamp({ x: p.x + moves[e.key][0], y: p.y + moves[e.key][1] }));
    } else if (e.key === "+" || e.key === "=") setZoomClamped(zoom + 0.1);
    else if (e.key === "-") setZoomClamped(zoom - 0.1);
  };

  const save = () => {
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    const scale = base * zoom; // px layar per px foto
    const sx = (w / 2 - VIEW / 2 - pos.x) / scale;
    const sy = (h / 2 - VIEW / 2 - pos.y) / scale;
    const size = VIEW / scale;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, OUT, OUT);
    ctx.drawImage(img, sx, sy, size, size, 0, 0, OUT, OUT);
    canvas.toBlob((blob) => blob && onDone(new File([blob], "foto-profil.jpg", { type: "image/jpeg" })), "image/jpeg", 0.9);
  };

  return (
    <Modal open={Boolean(file)} onClose={onCancel} title="Atur foto profil">
      <div className="flex flex-col items-center">
        <div
          tabIndex={0}
          aria-label="Geser foto untuk mengatur posisi. Tombol panah menggeser, plus dan minus memperbesar."
          onKeyDown={onKey}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={(e) => setZoomClamped(zoom - e.deltaY * 0.002)}
          className="relative cursor-grab touch-none overflow-hidden rounded-xl bg-mist active:cursor-grabbing"
          style={{ width: VIEW, height: VIEW }}
        >
          {img && (
            <img
              src={img.src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none select-none"
              style={{ width: w, height: h, left: VIEW / 2 - w / 2 + pos.x, top: VIEW / 2 - h / 2 + pos.y }}
            />
          )}
          {/* Lingkaran = bagian yang terlihat sebagai foto profil */}
          <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px_rgba(0,0,0,.5)]" />
        </div>
        <div className="mt-5 flex w-full max-w-[280px] items-center gap-3">
          <button type="button" onClick={() => setZoomClamped(zoom - 0.2)} className="rounded p-1 text-ink-mute hover:text-ink" aria-label="Perkecil">
            <ZoomOut size={18} />
          </button>
          <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoomClamped(Number(e.target.value))} className="flex-1 accent-teal" aria-label="Zoom" />
          <button type="button" onClick={() => setZoomClamped(zoom + 0.2)} className="rounded p-1 text-ink-mute hover:text-ink" aria-label="Perbesar">
            <ZoomIn size={18} />
          </button>
        </div>
        <p className="mt-2 text-xs text-ink-mute">Geser foto untuk mengatur posisi.</p>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Batal
        </button>
        <button type="button" className="btn-primary" onClick={save} disabled={!img}>
          Pakai foto ini
        </button>
      </div>
    </Modal>
  );
}
