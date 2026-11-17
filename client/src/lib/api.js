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
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.message || `Terjadi kesalahan (${res.status}).`);
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
export function upload(method, path, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, `${BASE}/api${path}`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* bukan JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(xhr.status, data.message || `Upload gagal (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new ApiError(0, "Koneksi terputus saat mengunggah."));
    xhr.send(formData);
  });
}
