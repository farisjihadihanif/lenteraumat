import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Copy, Eye, EyeOff, Printer, Share2 } from "lucide-react";

const LETTERS = "ABCDEF";
const TYPE = { pilihan: "Pilihan ganda", isian: "Isian", esai: "Esai" };

// Teks polos lembar soal (untuk disalin ke Word / grup kelas).
// eslint-disable-next-line react-refresh/only-export-components
export function sheetText(quiz, { withKey = false } = {}) {
  const head = [quiz.judul, [quiz.jenjang, quiz.level && `tingkat ${quiz.level}`].filter(Boolean).join(" · ")].filter(Boolean).join("\n");
  const soal = quiz.questions
    .map((q, i) => {
      const opts = q.type === "pilihan" ? "\n" + q.options.map((o, j) => `   ${LETTERS[j]}. ${o}`).join("\n") : q.type === "isian" ? "" : "\n   ________________________________";
      return `${i + 1}. ${q.question}${opts}`;
    })
    .join("\n\n");
  if (!withKey) return `${head}\n\n${soal}`;
  const kunci = quiz.questions
    .map((q, i) => {
      const huruf = q.type === "pilihan" ? `${LETTERS[q.options.indexOf(q.answer)] || "?"}. ` : "";
      return `${i + 1}. ${huruf}${q.answer}${q.explanation ? `\n   ${q.explanation}` : ""}`;
    })
    .join("\n");
  return `${head}\n\n${soal}\n\n— Kunci jawaban —\n${kunci}`;
}

function printSheet(quiz, withKey = false) {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const items = quiz.questions
    .map((q) => {
      const body =
        q.type === "pilihan"
          ? `<ol type="A">${q.options.map((o) => `<li>${esc(o)}</li>`).join("")}</ol>`
          : q.type === "esai"
            ? `<div class="lines"></div>`
            : "";
      return `<li><p>${esc(q.question)}</p>${body}</li>`;
    })
    .join("");
  const kunci = quiz.questions
    .map((q) => `<li><b>${q.type === "pilihan" ? `${LETTERS[q.options.indexOf(q.answer)] || "?"}. ` : ""}${esc(q.answer)}</b>${q.explanation ? `<br><small>${esc(q.explanation)}</small>` : ""}</li>`)
    .join("");
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${esc(quiz.judul)}</title>
<style>
body{font:14px/1.6 Georgia,serif;color:#111;max-width:720px;margin:32px auto;padding:0 24px}
h1{font-size:20px;margin:0}.meta{color:#555;margin:4px 0 16px}
.id{display:flex;gap:24px;border-bottom:1px solid #999;padding-bottom:12px;margin-bottom:16px}.id span{flex:1;border-bottom:1px dotted #777}
ol.soal>li{margin:0 0 14px}ol[type=A]{margin:4px 0}.lines{height:72px;background:repeating-linear-gradient(#fff 0 23px,#bbb 23px 24px)}
.kunci{page-break-before:always}
</style></head><body>
<h1>${esc(quiz.judul)}</h1><p class="meta">${esc([quiz.jenjang, quiz.level && `Tingkat ${quiz.level}`, `${quiz.questions.length} soal`].filter(Boolean).join(" · "))}</p>
<div class="id">Nama: <span></span> Kelas: <span></span></div>
<ol class="soal">${items}</ol>
${withKey ? `<section class="kunci"><h1>Kunci jawaban</h1><p class="meta">${esc(quiz.judul)}</p><ol>${kunci}</ol></section>` : ""}
<script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}

// Lembar soal + kunci jawaban (mode guru).
export default function QuizSheet({ quiz, onPost }) {
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState("");
  const copy = async (withKey) => {
    await navigator.clipboard.writeText(sheetText(quiz, { withKey }));
    setCopied(withKey ? "kunci" : "soal");
    setTimeout(() => setCopied(""), 1500);
  };
  return (
    <div>
      <div className="mb-4">
        <p className="font-serif text-lg font-semibold">{quiz.judul}</p>
        <p className="text-sm text-ink-mute">
          {[quiz.jenjang, quiz.level && `tingkat ${quiz.level}`, `${quiz.questions.length} soal`].filter(Boolean).join(" · ")}
          {quiz.book && (
            <>
              {" · "}
              <Link to={`/buku/${quiz.book._id}`} className="underline hover:text-ink">
                dari buku
              </Link>
            </>
          )}
        </p>
      </div>
      <ol className="space-y-4">
        {quiz.questions.map((q, i) => (
          <li key={i} className="flex gap-3">
            <span className="w-6 shrink-0 text-right font-semibold text-ink-mute">{i + 1}.</span>
            <div className="min-w-0 flex-1">
              <p>
                {q.question} {q.type !== quiz.type && <span className="ml-1 rounded bg-mist px-1.5 py-0.5 text-[11px] text-ink-mute">{TYPE[q.type]}</span>}
              </p>
              {q.type === "pilihan" && (
                <ol className="mt-1 space-y-0.5 text-[15px] text-ink-soft">
                  {q.options.map((o, j) => (
                    <li key={j} className={showKey && o === q.answer ? "font-semibold text-ink" : ""}>
                      {LETTERS[j]}. {o} {showKey && o === q.answer && <Check size={14} className="ml-1 inline text-emerald-600" />}
                    </li>
                  ))}
                </ol>
              )}
              {showKey && (
                <div className="mt-2 rounded-lg border-l-4 border-emerald-500 bg-emerald-500/10 px-3 py-2 text-sm">
                  {q.type !== "pilihan" && <p className="font-semibold">{q.answer}</p>}
                  {q.explanation && <p className="text-ink-soft">{q.explanation}</p>}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
        <button className="btn-outline btn-sm" onClick={() => setShowKey((v) => !v)}>
          {showKey ? <EyeOff size={14} /> : <Eye size={14} />} {showKey ? "Sembunyikan kunci" : "Lihat kunci jawaban"}
        </button>
        <button className="btn-outline btn-sm" onClick={() => copy(false)}>
          {copied === "soal" ? <Check size={14} /> : <Copy size={14} />} Salin soal
        </button>
        <button className="btn-outline btn-sm" onClick={() => copy(true)}>
          {copied === "kunci" ? <Check size={14} /> : <Copy size={14} />} Salin + kunci
        </button>
        <button className="btn-outline btn-sm" onClick={() => printSheet(quiz, true)} title="Soal di halaman pertama, kunci jawaban di halaman terpisah">
          <Printer size={14} /> Cetak
        </button>
        {onPost && (
          <button className="btn-teal btn-sm" onClick={onPost}>
            <Share2 size={14} /> Bagikan ke Discussion
          </button>
        )}
      </div>
    </div>
  );
}

// Lembar soal di halaman Discussion (kunci hanya bila boleh dilihat).
export function DiscussionQuiz({ kuis, onToggleShare }) {
  const [showKey, setShowKey] = useState(false);
  const quiz = { ...kuis, questions: kuis.soal.map((s, i) => ({ ...s, ...(kuis.kunci?.[i] || {}) })) };
  return (
    <div className="mt-5 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <p className="text-sm text-ink-mute">
        Lembar soal · {kuis.soal.length} soal{kuis.jenjang ? ` · ${kuis.jenjang}` : ""}. Tulis jawabanmu di balasan.
      </p>
      <ol className="mt-4 space-y-4">
        {quiz.questions.map((q, i) => (
          <li key={i} className="flex gap-3">
            <span className="w-6 shrink-0 text-right font-semibold text-ink-mute">{i + 1}.</span>
            <div className="min-w-0 flex-1">
              <p>{q.question}</p>
              {q.type === "pilihan" && (
                <ol className="mt-1 space-y-0.5 text-[15px] text-ink-soft">
                  {q.options.map((o, j) => (
                    <li key={j} className={showKey && o === q.answer ? "font-semibold text-ink" : ""}>
                      {LETTERS[j]}. {o}
                    </li>
                  ))}
                </ol>
              )}
              {showKey && q.answer && (
                <div className="mt-2 rounded-lg border-l-4 border-emerald-500 bg-emerald-500/10 px-3 py-2 text-sm">
                  <p className="font-semibold">{q.type === "pilihan" ? `${LETTERS[q.options.indexOf(q.answer)] || ""}. ${q.answer}` : q.answer}</p>
                  {q.explanation && <p className="text-ink-soft">{q.explanation}</p>}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {kuis.bisaLihatKunci ? (
          <button className="btn-outline btn-sm" onClick={() => setShowKey((v) => !v)}>
            {showKey ? <EyeOff size={14} /> : <Eye size={14} />} {showKey ? "Sembunyikan kunci" : "Lihat kunci jawaban"}
          </button>
        ) : (
          <p className="text-xs text-ink-mute">Kunci jawaban disimpan oleh pembuat soal.</p>
        )}
        <button className="btn-outline btn-sm" onClick={() => printSheet(quiz, kuis.bisaLihatKunci && showKey)}>
          <Printer size={14} /> Cetak soal
        </button>
        {kuis.pemilik && (
          <label className="ml-auto flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" className="h-4 w-4 accent-teal" checked={kuis.kunciPublik} onChange={(e) => onToggleShare?.(e.target.checked)} />
            Bagikan kunci ke semua pembaca
          </label>
        )}
      </div>
    </div>
  );
}
