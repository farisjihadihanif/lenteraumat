// Membaca pesan asli error Cloudinary tanpa membocorkan kunci.
// Objek error dari SDK memuat request_options.auth (key:secret), jadi jangan dicetak utuh.
const http = require("http");
const https = require("https");

const inti = (e) => e?.error || e || {};
const kode = (e) => inti(e).http_code || inti(e).code || "";

function sensor(teks, { api_key, api_secret } = {}) {
  let out = String(teks ?? "");
  if (api_secret) out = out.split(String(api_secret)).join("[rahasia]");
  if (api_key) out = out.split(String(api_key)).join(`...${String(api_key).slice(-4)}`);
  return out.replace(/cloudinary:\/\/\S+/gi, "cloudinary://[rahasia]");
}

function pesan(e, cfg) {
  const m = inti(e).message;
  return sensor(typeof m === "string" ? m : m?.message || "tanpa pesan", cfg);
}

// SDK uploader membuang isi jawaban berstatus tak terduga (mis. 403) dan hanya menyisakan
// "Server returned unexpected status code". Penjelasan aslinya ada di header x-cld-error.
function agenCatat(uploadPrefix = "") {
  const agent = new (/^http:/.test(uploadPrefix) ? http : https).Agent();
  const asli = agent.addRequest;
  agent.detail = "";
  agent.addRequest = function (req, ...rest) {
    req.prependOnceListener("response", (res) => {
      agent.detail = String(res.headers["x-cld-error"] || "");
    });
    return asli.call(this, req, ...rest);
  };
  return agent;
}

module.exports = { pesan, kode, sensor, agenCatat };
