import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { BookOpenText, Check, Copy, FileQuestion, FileText, Film, History, Image as ImageIcon, MessageCircle, Music, Paperclip, Plus, ScrollText, Send, Trash2, X, Search, RotateCcw, Share2 } from "lucide-react";
import QuizSheet from "../components/quiz/QuizSheet";
import { api } from "../lib/api";
import { compressImage, MAX_UPLOAD_MB } from "../lib/image";
import { useAuth } from "../context/Auth";
import Markdown from "../components/Markdown";
import BookCover from "../components/BookCover";
import { ConfirmModal, Modal, Spinner } from "../components/ui";
import { timeAgo } from "../lib/format";
import lumaImg from "../assets/Maskot/Luma1.png";

const MODES = [
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "ask", label: "Tanya buku", icon: BookOpenText },
  { id: "summary", label: "Ringkasan", icon: ScrollText },
  { id: "quiz", label: "Kuis", icon: FileQuestion },
];

function BookPicker({ open, onClose, onPick }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState(null);
  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api
        .get(`/books?limit=18&q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => setItems(r.items))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open]);
  return (
    <Modal open={open} onClose={onClose} title="Pilih buku untuk LUMA" width="max-w-2xl">
      <label className="relative block">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
        <input autoFocus className="field pl-9" placeholder="Cari judul atau penulis" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="mt-4 grid max-h-[55vh] grid-cols-3 gap-4 overflow-y-auto p-1 sm:grid-cols-4">
        {!items && <Spinner />}
        {items?.length === 0 && <p className="col-span-full text-sm text-ink-mute">Buku tidak ditemukan.</p>}
        {items?.map((b) => (
          <button key={b._id} onClick={() => onPick(b)} className="text-left">
            <BookCover book={b} />
            <p className="mt-2 line-clamp-2 font-serif text-xs font-semibold">{b.judul}</p>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function QuizCard({ quiz, onPost }) {
  const [answers, setAnswers] = useState({});
  const [checked, setChecked] = useState(false);
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9À-ɏ]+/g, " ").trim();
  const correct = (q, i) => (quiz.type === "pilihan" ? answers[i] === q.answer : norm(answers[i]) && norm(answers[i]) === norm(q.answer));
  const score = quiz.questions.filter((q, i) => correct(q, i)).length;
  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-soft">
        Kuis {quiz.type === "pilihan" ? "pilihan ganda" : "isian"} · tingkat {quiz.level} · <span className="font-semibold">{quiz.judul || quiz.book?.judul}</span>
      </p>
      {quiz.questions.map((q, i) => (
        <fieldset key={i} className="rounded-lg border border-line bg-mist/50 p-4">
          <legend className="sr-only">Soal {i + 1}</legend>
          <p className="font-semibold">
            {i + 1}. {q.question}
          </p>
          {quiz.type === "pilihan" ? (
            <div className="mt-3 grid gap-2">
              {q.options.map((opt) => {
                const picked = answers[i] === opt;
                const state = checked ? (opt === q.answer ? "border-emerald-500 bg-emerald-500/10" : picked ? "border-red-400 bg-red-500/10" : "border-line bg-surface") : picked ? "border-teal bg-teal-soft" : "border-line bg-surface hover:border-teal/50";
                return (
                  <label key={opt} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm ${state}`}>
                    <input type="radio" name={`q${i}`} className="mt-1 accent-teal" checked={picked} disabled={checked} onChange={() => setAnswers((a) => ({ ...a, [i]: opt }))} />
                    {opt}
                  </label>
                );
              })}
            </div>
          ) : (
            <input className={`field mt-3 ${checked ? (correct(q, i) ? "border-emerald-500" : "border-red-400") : ""}`} disabled={checked} placeholder="Jawabanmu" value={answers[i] || ""} onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))} />
          )}
          {checked && (
            <div className="mt-3 text-sm">
              <p className={correct(q, i) ? "font-semibold text-emerald-700" : "font-semibold text-danger"}>
                {correct(q, i) ? "Benar." : `Jawaban: ${q.answer}`}
              </p>
              {q.explanation && <p className="mt-1 text-ink-soft">{q.explanation}</p>}
            </div>
          )}
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        {!checked ? (
          <button className="btn-teal" onClick={() => setChecked(true)} disabled={Object.keys(answers).length === 0}>
            <Check size={16} /> Periksa jawaban
          </button>
        ) : (
          <>
            <p className="font-serif text-xl font-semibold">
              Skor {score}/{quiz.questions.length}
            </p>
            <button
              className="btn-outline btn-sm"
              onClick={() => {
                setAnswers({});
                setChecked(false);
              }}
            >
              <RotateCcw size={14} /> Ulangi
            </button>
          </>
        )}
        {onPost && (
          <button className="btn-outline btn-sm sm:ml-auto" onClick={onPost}>
            <Share2 size={14} /> Bagikan ke Discussion
          </button>
        )}
      </div>
    </div>
  );
}

const ACCEPT = "image/*,application/pdf,text/plain,text/markdown,text/csv,video/*,audio/*";
const MAX_FILES = 4;

function fileIcon(type = "") {
  if (type.startsWith("image/")) return ImageIcon;
  if (type.startsWith("video/")) return Film;
  if (type.startsWith("audio/")) return Music;
  return FileText;
}

function AttachmentChip({ name, type, url, onRemove }) {
  const Icon = fileIcon(type);
  return (
    <span className="inline-flex max-w-[220px] items-center gap-2 rounded-lg border border-line bg-surface py-1 pl-1 pr-2 text-xs text-ink">
      {url && type?.startsWith("image/") ? (
        <img src={url} alt="" className="h-8 w-8 rounded object-cover" />
      ) : (
        <span className="grid h-8 w-8 place-items-center rounded bg-mist text-ink-soft">
          <Icon size={15} />
        </span>
      )}
      <span className="truncate">{name}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} className="rounded p-0.5 text-ink-mute hover:text-ink" aria-label={`Hapus lampiran ${name}`}>
          <X size={13} />
        </button>
      )}
    </span>
  );
}

function PostQuizModal({ quiz, onClose }) {
  const navigate = useNavigate();
  const [judul, setJudul] = useState("");
  const [isi, setIsi] = useState("");
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!quiz) return;
    setJudul(`${quiz.untuk === "guru" ? "Latihan soal" : "Kuis"}: ${quiz.judul || quiz.book?.judul || ""}`.slice(0, 200));
    setIsi(`Kerjakan ${quiz.questions.length} soal berikut${quiz.jenjang ? ` (${quiz.jenjang})` : ""}. Tulis jawabanmu di kolom balasan, misalnya "1. B, 2. C, ...".`);
    setShare(false);
  }, [quiz]);
  if (!quiz) return null;
  const post = async () => {
    setBusy(true);
    try {
      const { discussion } = await api.post("/discussions", {
        judul,
        isi,
        book: quiz.book?._id || "",
        kuis: { judul: quiz.judul, type: quiz.type, level: quiz.level, jenjang: quiz.jenjang, questions: quiz.questions, kunciPublik: share },
      });
      toast.success("Soal diposting ke Discussion.");
      navigate(`/diskusi/${discussion._id}`);
    } catch (e) {
      toast.error(e.message);
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Bagikan soal ke Discussion">
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="pq-judul">Judul</label>
          <input id="pq-judul" className="field" maxLength={200} value={judul} onChange={(e) => setJudul(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="pq-isi">Petunjuk</label>
          <textarea id="pq-isi" className="field min-h-[90px]" maxLength={2000} value={isi} onChange={(e) => setIsi(e.target.value)} />
        </div>
        <label className="flex items-start gap-2 text-sm text-ink-soft">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-teal" checked={share} onChange={(e) => setShare(e.target.checked)} />
          <span>Tampilkan kunci jawaban ke semua pembaca. Biarkan tidak dicentang kalau soal ini untuk dikerjakan; kamu bisa membagikannya nanti.</span>
        </label>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Batal</button>
          <button className="btn-primary" onClick={post} disabled={busy || !judul.trim() || isi.trim().length < 10}>
            {busy ? "Memposting…" : "Posting"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Message({ m, onPostQuiz }) {
  const [copied, setCopied] = useState(false);
  if (m.role === "user") {
    const files = m.localFiles || m.lampiran || [];
    return (
      <div className="flex flex-col items-end gap-1.5">
        {files.length > 0 && (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
            {files.map((f, i) => (
              <AttachmentChip key={i} name={f.name} type={f.type || f.mimeType} url={f.url} />
            ))}
          </div>
        )}
        {m.content && <p className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-sm bg-forest px-4 py-2.5 text-[15px] text-white">{m.content}</p>}
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <img src={lumaImg} alt="" className="mt-1 h-9 w-9 shrink-0 rounded-full bg-lamp/30 object-contain" />
      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-line bg-surface px-4 py-3">
        {m.kind === "quiz" && m.data ? (
          m.data.untuk === "guru" ? (
            <QuizSheet quiz={m.data} onPost={() => onPostQuiz?.(m.data)} />
          ) : (
            <QuizCard quiz={m.data} onPost={() => onPostQuiz?.(m.data)} />
          )
        ) : (
          <Markdown>{m.content}</Markdown>
        )}
        {m.kind !== "quiz" && (
          <button
            className="mt-2 inline-flex items-center gap-1 text-xs text-ink-mute hover:text-ink"
            onClick={() => {
              navigator.clipboard.writeText(m.content);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Disalin" : "Salin"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function Luma() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [mode, setMode] = useState(() => (MODES.some((m) => m.id === params.get("mode")) ? params.get("mode") : params.get("book") ? "ask" : "chat"));
  const [book, setBook] = useState(null);
  const [picker, setPicker] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [opts, setOpts] = useState({ length: "sedang", type: "pilihan", count: 5, level: "sedang", untuk: "latihan", sumber: "buku", topik: "", jenjang: "" });
  const [files, setFiles] = useState([]);
  const [preparing, setPreparing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [postQuiz, setPostQuiz] = useState(null);
  const fileInput = useRef(null);
  const [showHistory, setShowHistory] = useState(false);
  const [del, setDel] = useState(null);
  const endRef = useRef(null);

  const loadSessions = useCallback(() => api.get("/ai/sessions").then((r) => setSessions(r.items)).catch(() => {}), []);
  const [quota, setQuota] = useState(null);
  const loadQuota = useCallback(() => api.get("/ai/usage").then(setQuota).catch(() => {}), []);

  useEffect(() => {
    api.get("/ai/status").then(setStatus).catch(() => setStatus(null));
    loadSessions();
    loadQuota();
  }, [loadSessions, loadQuota]);

  useEffect(() => {
    const id = params.get("book");
    if (id && id !== book?._id) api.get(`/books/${id}`).then((r) => setBook(r.book)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const newSession = () => {
    setSessionId(null);
    setMessages([]);
    setShowHistory(false);
  };

  const openSession = async (id) => {
    setShowHistory(false);
    try {
      const { session } = await api.get(`/ai/sessions/${id}`);
      setSessionId(session._id);
      setMessages(session.messages);
      setBook(session.book || null);
      const last = session.messages.at(-1)?.kind;
      setMode(session.book ? (last === "chat" ? "ask" : last) || "ask" : "chat");
    } catch (e) {
      toast.error(e.message);
    }
  };

  const pickBook = (b) => {
    setBook(b);
    setPicker(false);
    setParams(b ? { book: b._id } : {}, { replace: true });
    newSession();
  };

  const changeMode = (m) => {
    if (m === mode) return;
    setMode(m);
    if (m === "chat" || (sessionId && messages.length)) newSession();
  };

  const run = async (kind, payload) => {
    setBusy(true);
    const pending = payload.preview || payload.files?.length ? [{ role: "user", content: payload.preview || "", kind, localFiles: payload.files?.map((f) => ({ name: f.file.name, type: f.file.type, url: f.url })) }] : [];
    setMessages((m) => [...m, ...pending]);
    try {
      if (kind === "summary") {
        const r = await api.post("/ai/summary", { bookId: book._id, length: opts.length, sessionId });
        setSessionId(r.sessionId);
        setMessages((m) => [...m, { role: "model", content: r.reply, kind }]);
      } else if (kind === "quiz") {
        const fromBook = opts.sumber === "buku";
        const r = await api.post("/ai/quiz", {
          bookId: fromBook ? book?._id : undefined,
          topik: fromBook ? undefined : opts.topik,
          untuk: opts.untuk,
          type: opts.type,
          count: opts.count,
          level: opts.level,
          jenjang: opts.untuk === "guru" ? opts.jenjang : undefined,
          sessionId,
        });
        setSessionId(r.sessionId);
        setMessages((m) => [...m, { role: "model", content: "Kuis", kind, data: r.quiz }]);
      } else {
        const bookId = mode === "ask" && !sessionId ? book?._id : undefined;
        let body = { message: payload.message, sessionId, bookId };
        if (payload.files?.length) {
          body = new FormData();
          body.append("message", payload.message || "");
          if (sessionId) body.append("sessionId", sessionId);
          if (bookId) body.append("bookId", bookId);
          payload.files.forEach((f) => body.append("lampiran", f.file, f.file.name));
        }
        const r = await api.post("/ai/chat", body);
        setSessionId(r.sessionId);
        setMessages((m) => [...m, { role: "model", content: r.reply, kind }]);
      }
      loadSessions();
    } catch (e) {
      setMessages((m) => m.slice(0, m.length - pending.length));
      if (payload.message) setInput(payload.message);
      if (payload.files?.length) setFiles(payload.files);
      toast.error(e.message);
    } finally {
      setBusy(false);
      loadQuota();
    }
  };

  // Batas mengikuti server (4 MB di Vercel); sebelum status terbaca pakai yang paling aman.
  const maxMb = status?.maxAttachMb || MAX_UPLOAD_MB;
  const maxTotalMb = status ? status.maxAttachTotalMb : MAX_UPLOAD_MB;

  const addFiles = async (list) => {
    const incoming = Array.from(list || []);
    if (!incoming.length) return;
    const ok = [];
    setPreparing(true);
    for (const original of incoming) {
      try {
        const isImage = original.type.startsWith("image/");
        const file = isImage ? await compressImage(original) : original;
        if (file.size > maxMb * 1024 * 1024) throw new Error(`${file.name} lebih dari ${maxMb} MB. Pilih file yang lebih kecil.`);
        ok.push({ file, url: isImage ? URL.createObjectURL(file) : "" });
      } catch (e) {
        toast.error(e.message);
      }
    }
    setPreparing(false);
    setFiles((cur) => {
      const next = [...cur, ...ok];
      if (next.length > MAX_FILES) toast.info(`Maksimal ${MAX_FILES} lampiran sekali kirim.`);
      return next.slice(0, MAX_FILES);
    });
  };

  const send = (text) => {
    const message = (text ?? input).trim();
    if ((!message && !files.length) || busy) return;
    if (preparing) return toast.info("Lampiran masih diproses. Tunggu sebentar.");
    if (maxTotalMb && files.reduce((n, f) => n + f.file.size, 0) > maxTotalMb * 1024 * 1024) {
      return toast.error(`Total lampiran lebih dari ${maxTotalMb} MB. Hapus salah satu lampiran.`);
    }
    if (mode === "ask" && !book) return setPicker(true);
    const attached = files;
    setInput("");
    setFiles([]);
    run(mode === "ask" ? "ask" : "chat", { message, preview: message, files: attached });
  };

  const needsBook = mode === "ask" || mode === "summary" || (mode === "quiz" && opts.sumber === "buku");
  const disabled = status && !status.enabled;

  return (
    <div className="container-page grid gap-6 py-6 lg:grid-cols-[260px_1fr]">
      {/* Riwayat */}
      <aside className={`${showHistory ? "fixed inset-0 z-40 bg-black/40 p-4" : "hidden"} lg:static lg:block lg:bg-transparent lg:p-0`} onClick={(e) => e.target === e.currentTarget && setShowHistory(false)}>
        <div className="flex h-full max-h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-xl border border-line bg-surface p-3 lg:sticky lg:top-20">
          {/* Mode LUMA (layar lebar) */}
          <div className="hidden flex-col gap-1 border-b border-line pb-3 lg:flex" role="tablist" aria-label="Mode LUMA">
            {MODES.map(({ id, label, icon: Icon }) => (
              <button key={id} role="tab" aria-selected={mode === id} onClick={() => changeMode(id)} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold ${mode === id ? "bg-night text-white" : "text-ink-soft hover:bg-mist"}`}>
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between px-1 pb-2 pt-3">
            <p className="font-bold">Riwayat</p>
            <button className="rounded p-1 hover:bg-mist lg:hidden" onClick={() => setShowHistory(false)} aria-label="Tutup riwayat">
              <X size={18} />
            </button>
          </div>
          <button onClick={newSession} className="btn-outline btn-sm mb-2 w-full">
            <Plus size={14} /> Percakapan baru
          </button>
          <ul className="-mx-1 flex-1 overflow-y-auto">
            {sessions.length === 0 && <li className="px-2 py-4 text-sm text-ink-mute">Belum ada percakapan.</li>}
            {sessions.map((s) => (
              <li key={s._id} className={`group flex items-center rounded-lg ${s._id === sessionId ? "bg-teal-soft" : "hover:bg-mist"}`}>
                <button onClick={() => openSession(s._id)} className="min-w-0 flex-1 px-2 py-2 text-left">
                  <p className="truncate text-sm font-semibold">{s.title}</p>
                  <p className="truncate text-xs text-ink-mute">
                    {s.book ? `${s.book.judul} · ` : ""}
                    {timeAgo(s.updatedAt)}
                  </p>
                </button>
                <button onClick={() => setDel(s)} className="mr-1 rounded p-1.5 text-ink-mute opacity-0 hover:text-danger focus:opacity-100 group-hover:opacity-100" aria-label={`Hapus ${s.title}`}>
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <section className="flex min-h-[calc(100vh-8rem)] min-w-0 flex-col rounded-xl border border-line bg-surface">
        {/* Mode LUMA (HP & tablet); di layar lebar pindah ke kolom kiri */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3 lg:hidden">
          <button className="btn-ghost btn-sm" onClick={() => setShowHistory(true)}>
            <History size={16} /> Riwayat
          </button>
          <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Mode LUMA">
            {MODES.map(({ id, label, icon: Icon }) => (
              <button key={id} role="tab" aria-selected={mode === id} onClick={() => changeMode(id)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${mode === id ? "bg-night text-white" : "text-ink-soft hover:bg-mist"}`}>
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>
        </div>

        {needsBook && (
          <div className="flex items-center gap-3 border-b border-line bg-mist/60 px-4 py-3">
            {book ? (
              <>
                <div className="w-9 shrink-0">
                  <BookCover book={book} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-serif text-sm font-semibold">{book.judul}</p>
                  <p className="truncate text-xs text-ink-mute">{book.penulis}</p>
                </div>
                <button className="btn-outline btn-sm" onClick={() => setPicker(true)}>
                  Ganti buku
                </button>
              </>
            ) : (
              <>
                <p className="flex-1 text-sm text-ink-soft">Pilih buku dari Library dulu.</p>
                <button className="btn-teal btn-sm" onClick={() => setPicker(true)}>
                  Pilih buku
                </button>
              </>
            )}
          </div>
        )}

        <div
          className={`relative flex-1 space-y-5 overflow-y-auto p-4 sm:p-6 ${dragging ? "outline-dashed outline-2 -outline-offset-8 outline-teal" : ""}`}
          onDragOver={(e) => {
            if (mode === "chat" || mode === "ask") {
              e.preventDefault();
              setDragging(true);
            }
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (mode === "chat" || mode === "ask") addFiles(e.dataTransfer.files);
          }}
        >
          {disabled && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">LUMA belum aktif di server ini. Admin perlu mengisi GEMINI_API_KEY.</p>
          )}
          {messages.length === 0 && (
            <div className="mx-auto max-w-lg py-8 text-center">
              <img src={lumaImg} alt="" className="mx-auto h-28 w-28" />
              <h1 className="mt-3 font-serif text-2xl font-semibold">Halo{user?.namaLengkap ? `, ${user.namaLengkap.split(" ")[0]}` : ""}! Aku LUMA.</h1>
              <p className="mt-2 text-sm text-ink-soft">
                {mode === "chat" && "Tanya apa saja. Bisa juga kirim foto catatan, PDF, atau video untuk dibahas."}
                {mode === "ask" && "Pilih buku, lalu tanyakan isinya. LUMA menjawab berdasarkan buku dan menyebut halamannya."}
                {mode === "summary" && "Pilih panjang ringkasan, lalu aku rangkum isi bukunya."}
                {mode === "quiz" && (opts.untuk === "guru" ? "Buat lembar soal lengkap dengan kunci jawaban. Bisa dicetak atau diposting ke Discussion untuk dikerjakan murid." : "Pilih buku atau tulis topik, lalu uji pemahamanmu.")}
              </p>
            </div>
          )}
          {messages.map((m, i) => (
            <Message key={m._id || i} m={m} onPostQuiz={setPostQuiz} />
          ))}
          {busy && (
            <div className="flex items-center gap-3 text-sm text-ink-mute">
              <img src={lumaImg} alt="" className="h-9 w-9 rounded-full bg-lamp/30" />
              <span className="flex gap-1" aria-label="LUMA sedang menulis">
                {[0, 1, 2].map((d) => (
                  <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-forest" style={{ animationDelay: `${d * 150}ms` }} />
                ))}
              </span>
              {mode === "quiz" ? "Menyusun soal…" : mode !== "chat" && !sessionId ? "Membaca buku…" : ""}
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t border-line p-3 sm:p-4">
          {mode === "summary" ? (
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm font-semibold" htmlFor="len">
                Panjang
              </label>
              <select id="len" className="field w-auto" value={opts.length} onChange={(e) => setOpts((o) => ({ ...o, length: e.target.value }))}>
                <option value="singkat">Singkat (poin penting)</option>
                <option value="sedang">Sedang</option>
                <option value="lengkap">Lengkap per bab</option>
              </select>
              <button className="btn-primary ml-auto" disabled={!book || busy || disabled} onClick={() => run("summary", { preview: `Ringkas buku “${book.judul}”` })}>
                <ScrollText size={16} /> Buat ringkasan
              </button>
            </div>
          ) : mode === "quiz" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-lg border border-line p-0.5 text-sm font-semibold" role="radiogroup" aria-label="Kuis untuk">
                  {[
                    ["latihan", "Latihan sendiri"],
                    ["guru", "Soal untuk murid"],
                  ].map(([v, l]) => (
                    <button key={v} role="radio" aria-checked={opts.untuk === v} onClick={() => setOpts((o) => ({ ...o, untuk: v, type: v === "latihan" && !["pilihan", "isian"].includes(o.type) ? "pilihan" : o.type }))} className={`rounded-md px-3 py-1.5 ${opts.untuk === v ? "bg-night text-white" : "text-ink-soft hover:text-ink"}`}>
                      {l}
                    </button>
                  ))}
                </div>
                <div className="flex rounded-lg border border-line p-0.5 text-sm font-semibold" role="radiogroup" aria-label="Sumber soal">
                  {[
                    ["buku", "Dari buku"],
                    ["topik", "Dari topik"],
                  ].map(([v, l]) => (
                    <button key={v} role="radio" aria-checked={opts.sumber === v} onClick={() => setOpts((o) => ({ ...o, sumber: v }))} className={`rounded-md px-3 py-1.5 ${opts.sumber === v ? "bg-night text-white" : "text-ink-soft hover:text-ink"}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              {opts.sumber === "topik" && (
                <input className="field" maxLength={300} value={opts.topik} onChange={(e) => setOpts((o) => ({ ...o, topik: e.target.value }))} placeholder="Topik soal, mis. Thaharah dan macam-macam air" aria-label="Topik soal" />
              )}
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="label text-xs" htmlFor="q-type">Jenis</label>
                  <select id="q-type" className="field w-auto" value={opts.type} onChange={(e) => setOpts((o) => ({ ...o, type: e.target.value }))}>
                    <option value="pilihan">Pilihan ganda</option>
                    <option value="isian">Isian singkat</option>
                    {opts.untuk === "guru" && <option value="esai">Esai</option>}
                    {opts.untuk === "guru" && <option value="campuran">Campuran</option>}
                  </select>
                </div>
                <div>
                  <label className="label text-xs" htmlFor="q-count">Jumlah</label>
                  <select id="q-count" className="field w-auto" value={opts.count} onChange={(e) => setOpts((o) => ({ ...o, count: Number(e.target.value) }))}>
                    {(opts.untuk === "guru" ? [5, 10, 15, 20, 25, 30] : [3, 5, 10, 15]).map((n) => (
                      <option key={n} value={n}>
                        {n} soal
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label text-xs" htmlFor="q-level">Tingkat</label>
                  <select id="q-level" className="field w-auto" value={opts.level} onChange={(e) => setOpts((o) => ({ ...o, level: e.target.value }))}>
                    <option value="mudah">Mudah</option>
                    <option value="sedang">Sedang</option>
                    <option value="sulit">Sulit</option>
                  </select>
                </div>
                {opts.untuk === "guru" && (
                  <div className="min-w-[160px] flex-1">
                    <label className="label text-xs" htmlFor="q-jenjang">Untuk kelas</label>
                    <input id="q-jenjang" className="field" maxLength={80} value={opts.jenjang} onChange={(e) => setOpts((o) => ({ ...o, jenjang: e.target.value }))} placeholder="mis. SMP kelas 8" />
                  </div>
                )}
                <button
                  className="btn-primary ml-auto"
                  disabled={busy || disabled || (opts.sumber === "buku" ? !book : opts.topik.trim().length < 3)}
                  onClick={() => {
                    const about = opts.sumber === "buku" ? `“${book.judul}”` : `“${opts.topik.trim()}”`;
                    run("quiz", { preview: `${opts.untuk === "guru" ? "Buatkan lembar" : "Buat"} ${opts.count} soal ${{ pilihan: "pilihan ganda", isian: "isian", esai: "esai", campuran: "campuran" }[opts.type]} (${opts.level}) tentang ${about}${opts.untuk === "guru" ? " beserta kunci jawaban" : ""}` });
                  }}
                >
                  <FileQuestion size={16} /> {opts.untuk === "guru" ? "Buat lembar soal" : "Buat kuis"}
                </button>
              </div>
            </div>
          ) : (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              {files.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {files.map((f, i) => (
                    <AttachmentChip key={i} name={f.file.name} type={f.file.type} url={f.url} onRemove={() => setFiles((cur) => cur.filter((_, j) => j !== i))} />
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
              <input ref={fileInput} type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              <button type="button" className="btn-outline h-11 w-11 shrink-0 p-0" onClick={() => fileInput.current?.click()} disabled={disabled || files.length >= MAX_FILES} aria-label="Lampirkan gambar, file, atau video" title="Lampirkan gambar, PDF, audio, atau video">
                <Paperclip size={18} />
              </button>
              <textarea
                rows={1}
                className="field max-h-40 min-h-[44px] resize-none"
                value={input}
                maxLength={4000}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
                onPaste={(e) => {
                  const pasted = Array.from(e.clipboardData?.files || []);
                  if (pasted.length) {
                    e.preventDefault();
                    addFiles(pasted);
                  }
                }}
                placeholder={mode === "ask" ? (book ? `Tanya tentang “${book.judul}”` : "Pilih buku dulu") : "Tulis pesan, atau lampirkan foto/PDF/video"}
                aria-label="Pesan"
                disabled={disabled}
              />
              <button className="btn-primary h-11 w-11 shrink-0 p-0" disabled={(!input.trim() && !files.length) || busy || disabled} aria-label="Kirim">
                <Send size={18} />
              </button>
              </div>
            </form>
          )}
          <p className="mt-2 text-center text-[11px] text-ink-mute">
            {quota?.remaining != null && (
              <span className={quota.remaining <= 5 ? "font-semibold text-lantern-text" : ""}>
                Sisa {quota.remaining} dari {quota.limit} permintaan hari ini.{" "}
              </span>
            )}
            LUMA bisa keliru. Periksa kembali jawaban penting ke buku sumbernya atau ke guru. {book && <Link to={`/buku/${book._id}/baca`} className="underline">Buka bukunya</Link>}
          </p>
        </div>
      </section>

      <BookPicker open={picker} onClose={() => setPicker(false)} onPick={pickBook} />
      <PostQuizModal quiz={postQuiz} onClose={() => setPostQuiz(null)} />
      <ConfirmModal
        open={Boolean(del)}
        title="Hapus percakapan?"
        message={`“${del?.title}” akan dihapus dari riwayat.`}
        onClose={() => setDel(null)}
        onConfirm={async () => {
          await api.del(`/ai/sessions/${del._id}`).catch((e) => toast.error(e.message));
          if (del._id === sessionId) newSession();
          setDel(null);
          loadSessions();
        }}
      />
    </div>
  );
}
