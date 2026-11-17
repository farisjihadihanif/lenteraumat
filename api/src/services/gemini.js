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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.geminiModel)}:generateContent`;
  let res;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": config.geminiApiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    });
  } catch (error) {
    console.error("Gemini:", error.message);
    throw new HttpError(502, "LUMA sedang tidak bisa dihubungi. Coba lagi sebentar.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Gemini error", res.status, data?.error?.message);
    if (res.status === 429) throw new HttpError(429, "LUMA sedang sibuk (batas pemakaian). Coba lagi sebentar.");
    throw new HttpError(502, "LUMA gagal menjawab. Coba lagi.");
  }
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  if (!text) throw new HttpError(502, "LUMA tidak memberi jawaban. Coba ubah pertanyaanmu.");
  return text;
}

module.exports = { generate, setFetch };
