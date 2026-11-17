// Pemanggil Google Gemini untuk LUMA. Key hanya dipakai di server.
const config = require("../config");
const { HttpError } = require("../middleware/errors");

const SYSTEM = [
  "Kamu adalah LUMA, maskot dan asisten belajar di LenteraUmat, perpustakaan digital Islami.",
  "Jawab dalam bahasa Indonesia yang ramah, jelas, dan ringkas. Gunakan Markdown sederhana (poin, tebal).",
  "Kalau menjawab berdasarkan isi buku, sebutkan halaman bila tersedia (format teks memuat penanda [Halaman n]).",
  "Kalau informasi tidak ada di buku, katakan terus terang. Jangan mengarang dalil atau kutipan.",
].join(" ");

let fetchImpl = (...args) => fetch(...args);
function setFetch(fn) {
  fetchImpl = fn;
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function callModel(model, body) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": config.geminiApiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } catch (error) {
    return { status: 0, error };
  }
}

async function generate(contents, { json = null, temperature = 0.6 } = {}) {
  if (!config.geminiApiKey) throw new HttpError(503, "LUMA belum aktif: GEMINI_API_KEY belum diisi di server.");
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents,
    generationConfig: {
      temperature,
      ...(json ? { responseMimeType: "application/json", responseSchema: json } : {}),
    },
  };
  // Model utama dicoba 2x, lalu model cadangan, karena server Google kadang sibuk/lambat.
  const fallback = config.geminiFallbackModel;
  const attempts = [config.geminiModel, config.geminiModel, ...(fallback && fallback !== config.geminiModel ? [fallback] : [])];
  let last;
  for (let i = 0; i < attempts.length; i++) {
    if (i > 0) await wait(i === 1 ? 1200 : 300);
    last = await callModel(attempts[i], body);
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

module.exports = { generate, setFetch };
