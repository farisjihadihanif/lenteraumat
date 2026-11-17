// Membaca PDF (jumlah halaman & teks untuk LUMA) lewat worker thread terpisah.
// Kalau worker macet atau rusak, hanya worker itu yang dimatikan; server tetap jalan.
const path = require("path");
const { Worker } = require("worker_threads");

const TIMEOUT = { count: 60 * 1000, text: 5 * 60 * 1000 };

function run(task, buffer) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, "pdfWorker.js"));
    let done = false;
    const finish = (fn, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      worker.terminate().catch(() => {});
      fn(value);
    };
    const timer = setTimeout(() => finish(reject, new Error("Membaca PDF terlalu lama.")), TIMEOUT[task]);
    worker.on("message", (msg) => (msg.error ? finish(reject, new Error(msg.error)) : finish(resolve, msg.result)));
    worker.on("error", (err) => finish(reject, err));
    worker.on("exit", (code) => finish(reject, new Error(`Pembaca PDF berhenti (kode ${code}).`)));
    // Salin buffer supaya data asli tetap bisa dipakai (mis. untuk diunggah).
    const copy = Uint8Array.from(buffer).buffer;
    worker.postMessage({ id: 1, task, data: copy }, [copy]);
  });
}

const countPages = (buffer) => run("count", buffer);
const extractText = (buffer) => run("text", buffer);

module.exports = { countPages, extractText };
