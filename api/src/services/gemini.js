// Pemanggil Google Gemini untuk LUMA. Key hanya dipakai di server.
const config = require("../config");
const { HttpError } = require("../middleware/errors");

// Kepribadian LUMA. Ditulis untuk menghindari gaya jawaban AI yang kaku & bertele-tele.
const PERSONA = `Kamu LUMA, teman belajar di LenteraUmat, perpustakaan digital Islami. Bayangkan dirimu kakak tingkat yang pintar dan sabar: hangat, santai tapi sopan, tidak menggurui.

Cara menjawab:
- Kalimat pertama langsung menjawab. Jangan membuka dengan basa-basi ("Tentu!", "Pertanyaan bagus", "Baik,") dan jangan mengulang pertanyaan.
- Panjang jawaban mengikuti pertanyaan. Pertanyaan singkat cukup 1–3 kalimat. Uraian panjang hanya kalau diminta atau memang perlu.
- Tulis seperti orang menjelaskan langsung: paragraf pendek. Daftar poin hanya untuk langkah, perbandingan, atau rincian yang memang berurutan. Cetak tebal secukupnya.
- Pakai contoh konkret yang dekat dengan keseharian pelajar dan mahasiswa Indonesia.
- Hindari frasa klise seperti "mari kita selami", "penting untuk dicatat", "secara keseluruhan", "semoga membantu", "jangan ragu untuk bertanya", dan emoji berlebihan.
- Jangan menutup dengan rangkuman yang mengulang isi. Tanyakan balik hanya kalau itu benar-benar membantu langkah berikutnya.
- Ikuti bahasa pengguna (Indonesia santai atau baku, Inggris, Arab).

Soal agama:
- Rujuk Al-Qur'an dengan nama surah dan nomor ayat, hadis dengan perawinya. Jangan mengarang dalil, nomor ayat, atau kutipan. Kalau tidak yakin, katakan terus terang.
- Untuk masalah fikih yang diperselisihkan, sebutkan bahwa ulama berbeda pendapat secara ringkas, dan untuk kasus pribadi sarankan bertanya ke guru atau ustadz.

Isi buku dan lampiran:
- Kalau ada teks buku, jawab berdasarkan buku itu dan sebut halamannya (teks memuat penanda [Halaman n]). Bedakan dengan jelas mana isi buku dan mana penjelasan tambahanmu.
- Kalau pengguna mengirim gambar, dokumen, audio, atau video, perhatikan isinya dan jawab berdasarkan itu. Sebutkan kalau ada bagian yang tidak terbaca jelas.`;

function systemFor(user) {
  const name = String(user?.namaLengkap || user?.username || "").trim().split(/\s+/)[0];
  return name ? `${PERSONA}\n\nNama pengguna: ${name}. Sesekali panggil namanya secara wajar, tidak di setiap jawaban.` : PERSONA;
}

let fetchImpl = (...args) => fetch(...args);
function setFetch(fn) {
  fetchImpl = fn;
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function callModel(model, body, timeoutMs, signal) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": config.geminiApiKey },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } catch (error) {
    return { status: 0, error };
  }
}

// Versi streaming: onText dipanggil tiap potongan teks. Hasil akhirnya berbentuk sama dengan callModel.
async function streamModel(model, body, timeoutMs, onText, signal) {
  const url = `${API}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
  const ctrl = new AbortController();
  // Teks pertama ditunggu paling lama 45 detik; sisanya cukup dibatasi waktu total permintaan.
  const first = setTimeout(() => ctrl.abort(new Error("Gemini tidak menjawab.")), Math.min(45000, timeoutMs));
  const total = setTimeout(() => ctrl.abort(new Error("Waktu habis.")), Math.min(10 * 60 * 1000, timeoutMs));
  let text = "";
  let finishReason = "";
  let promptFeedback;
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": config.geminiApiKey },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, ctrl.signal]) : ctrl.signal,
    });
    if (res.status !== 200) return { status: res.status, data: await res.json().catch(() => ({})) };
    const line = (raw) => {
      if (!raw.startsWith("data:")) return;
      const data = JSON.parse(raw.slice(5));
      if (data.error) throw new Error(data.error.message || "Gemini terputus.");
      promptFeedback = data.promptFeedback || promptFeedback;
      const cand = data.candidates?.[0];
      finishReason = cand?.finishReason || finishReason;
      const part = (cand?.content?.parts || []).map((p) => (p.thought ? "" : p.text || "")).join("");
      if (!part) return;
      clearTimeout(first);
      text += part;
      onText(part);
    };
    const decoder = new TextDecoder();
    let buf = "";
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true });
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      lines.forEach(line);
    }
    line(buf.trim());
    if (text && !finishReason) throw new Error("Jawaban Gemini terputus.");
    return { status: 200, data: { candidates: [{ finishReason, content: { parts: [{ text }] } }], promptFeedback } };
  } catch (error) {
    return { status: 0, error };
  } finally {
    clearTimeout(first);
    clearTimeout(total);
  }
}

// onText: jawaban dialirkan selagi ditulis. Kalau aliran gagal, dicoba lagi tanpa streaming; onReset
// dipanggil bila potongan yang telanjur terkirim harus dibuang.
async function generate(contents, { json = null, temperature = 0.75, user = null, deadline = Infinity, onText = null, onReset = null, signal = null } = {}) {
  if (!config.geminiApiKey) throw new HttpError(503, "LUMA belum aktif: GEMINI_API_KEY belum diisi di server.");
  const body = {
    systemInstruction: { parts: [{ text: systemFor(user) }] },
    contents,
    generationConfig: {
      temperature,
      ...(json ? { responseMimeType: "application/json", responseSchema: json } : {}),
    },
  };
  // Model utama dicoba 2x, lalu model cadangan, karena server Google kadang sibuk/lambat.
  const fallback = config.geminiFallbackModel;
  const attempts = [config.geminiModel, config.geminiModel, ...(fallback && fallback !== config.geminiModel ? [fallback] : [])];
  // Saat streaming, percobaan terakhir selalu tanpa streaming.
  if (onText) attempts.push(attempts.at(-1));
  let streaming = Boolean(onText);
  let last;
  for (let i = 0; i < attempts.length; i++) {
    if (i > 0) await wait(i === 1 ? 1200 : 300);
    // Jangan mulai percobaan yang pasti terpotong batas waktu permintaan.
    const left = deadline - Date.now();
    if (i > 0 && left < 5000) break;
    if (streaming && i < attempts.length - 1) {
      let sent = false;
      const forward = (t) => {
        sent = true;
        onText(t);
      };
      last = await streamModel(attempts[i], body, Math.max(1000, left), forward, signal);
      if (last.status !== 200 && sent) onReset?.();
      // Model sibuk: percobaan berikutnya tetap dialirkan. Gagal karena hal lain: tanpa streaming.
      streaming = last.status === 429 || last.status === 503;
    } else last = await callModel(attempts[i], body, Math.max(1000, Math.min(60000, left)), signal);
    if (signal?.aborted) throw new HttpError(499, "Permintaan dibatalkan.");
    if (last.status === 200) {
      const cand = last.data?.candidates?.[0];
      const text = cand?.content?.parts?.map((p) => p.text || "").join("") || "";
      if (text) return text;
      if (cand?.finishReason === "SAFETY" || last.data?.promptFeedback?.blockReason) {
        throw new HttpError(422, "LUMA tidak bisa menjawab pertanyaan itu. Coba ubah kalimatnya.");
      }
      continue;
    }
    const msg = last.error ? last.error.cause?.code || last.error.message : last.data?.error?.message;
    console.error(`Gemini (${attempts[i]}) gagal:`, last.status || "koneksi", String(msg || "").slice(0, 300));
    if (last.status === 400 && /API key/i.test(msg || "")) throw new HttpError(503, "GEMINI_API_KEY di server tidak valid.");
    if (last.status === 403) throw new HttpError(503, "GEMINI_API_KEY ditolak Google (cek key di AI Studio).");
    if (last.status && !RETRYABLE.has(last.status) && last.status !== 404) break;
  }
  if (last?.status === 429) throw new HttpError(429, "LUMA sedang sibuk (batas pemakaian Gemini). Coba lagi sebentar.");
  if (!last?.status) throw new HttpError(502, "LUMA tidak bisa menghubungi Google. Cek koneksi internet server lalu coba lagi.");
  throw new HttpError(502, "LUMA gagal menjawab. Coba lagi.");
}

// ---------- Lampiran (gambar, PDF, audio, video) lewat Gemini Files API ----------
// File disimpan Google selama 48 jam, jadi lampiran tetap bisa dibahas di pesan berikutnya.
const API = "https://generativelanguage.googleapis.com";

async function uploadFile(buffer, mimeType, displayName = "lampiran", { deadline = Infinity } = {}) {
  if (!config.geminiApiKey) throw new HttpError(503, "LUMA belum aktif: GEMINI_API_KEY belum diisi di server.");
  const start = await fetchImpl(`${API}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": config.geminiApiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(buffer.length),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: displayName.slice(0, 100) } }),
    signal: AbortSignal.timeout(60000),
  }).catch(() => null);
  const uploadUrl = start?.headers?.get("x-goog-upload-url");
  if (!start?.ok || !uploadUrl) {
    console.error("Gemini upload start gagal:", start?.status);
    throw new HttpError(502, "Lampiran gagal dikirim ke LUMA. Coba lagi.");
  }
  const done = await fetchImpl(uploadUrl, {
    method: "POST",
    headers: { "Content-Length": String(buffer.length), "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" },
    body: buffer,
    signal: AbortSignal.timeout(Math.max(1000, Math.min(5 * 60 * 1000, deadline - Date.now()))),
  }).catch(() => null);
  let file = done?.ok ? (await done.json().catch(() => ({}))).file : null;
  if (!file?.uri) throw new HttpError(502, "Lampiran gagal dikirim ke LUMA. Coba lagi.");
  // Video & audio perlu diproses dulu oleh Google sebelum bisa dipakai.
  for (let i = 0; file.state === "PROCESSING" && i < 45 && deadline - Date.now() > 30000; i++) {
    await wait(2000);
    const r = await fetchImpl(`${API}/v1beta/${file.name}`, { headers: { "x-goog-api-key": config.geminiApiKey } }).catch(() => null);
    if (r?.ok) file = await r.json();
  }
  if (file.state === "FAILED") throw new HttpError(422, "LUMA tidak bisa memproses lampiran itu.");
  if (file.state === "PROCESSING") throw new HttpError(504, "Video masih diproses terlalu lama. Coba video yang lebih pendek.");
  return { uri: file.uri, mimeType: file.mimeType || mimeType, name: file.name, expiresAt: file.expirationTime };
}

module.exports = { generate, uploadFile, setFetch, systemFor };
