// Pemanggil API. Cookie login ikut terkirim (credentials: include).
const BASE = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, body, { signal } = {}) {
  const opts = { method, credentials: "include", signal, headers: {} };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, opts);
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError(0, "Tidak bisa terhubung ke server. Periksa koneksi internetmu.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (!data && res.status === 413) throw new ApiError(413, "File terlalu besar untuk dikirim. Coba file di bawah 4 MB.");
    // Tanpa balasan JSON = server API mati / tidak terjangkau (mis. MongoDB belum tersambung).
    if (!data) throw new ApiError(res.status, "Server API tidak merespons. Pastikan server di folder api sedang jalan dan MongoDB tersambung.");
    throw new ApiError(res.status, data.message || `Terjadi kesalahan (${res.status}).`);
  }
  return data;
}

export const api = {
  get: (p, o) => request("GET", p, undefined, o),
  post: (p, b, o) => request("POST", p, b, o),
  put: (p, b, o) => request("PUT", p, b, o),
  patch: (p, b, o) => request("PATCH", p, b, o),
  del: (p, b, o) => request("DELETE", p, b, o),
};

export const fileUrl = (bookId) => `${BASE}/api/books/${bookId}/file`;

// Upload dengan progres (fetch belum punya progres upload).
function send(method, url, formData, onProgress, credentials) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.withCredentials = credentials;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* bukan JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(xhr.status, data.message || data.error?.message || `Upload gagal (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new ApiError(0, "Koneksi terputus saat mengunggah."));
    xhr.send(formData);
  });
}

// Simpan buku beserta PDF/sampulnya. File diunggah langsung ke Cloudinary dengan tanda tangan
// dari API; tanpa Cloudinary (laptop) file dikirim lewat API.
export async function saveBook(method, path, fields, { pdf, cover } = {}, onProgress) {
  const parts = [
    { file: pdf, kind: "buku", key: "fileUpload", form: "file" },
    { file: cover, kind: "sampul", key: "coverUpload", form: "cover" },
  ].filter((p) => p.file);
  const signed = await Promise.all(parts.map(({ file, kind }) => api.post("/uploads/sign", { kind, type: file.type, size: file.size })));
  if (signed.some((s) => !s.direct)) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    for (const p of parts) fd.append(p.form, p.file);
    return send(method, `${BASE}/api${path}`, fd, onProgress, true);
  }
  const body = { ...fields };
  const total = parts.reduce((n, p) => n + p.file.size, 0);
  let done = 0;
  for (const [i, p] of parts.entries()) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(signed[i].fields)) fd.append(k, v);
    fd.append("file", p.file);
    const before = done;
    const r = await send("POST", signed[i].url, fd, (pct) => onProgress?.(Math.round(((before + (p.file.size * pct) / 100) / total) * 100)), false);
    done += p.file.size;
    body[p.key] = { public_id: r.public_id, version: r.version, signature: r.signature };
  }
  return request(method, path, body);
}
