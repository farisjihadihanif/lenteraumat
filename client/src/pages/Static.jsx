import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Link } from "react-router-dom";
import luma from "../assets/Maskot/Luma1.png";

export function NotFound() {
  return (
    <div className="container-page grid min-h-[60vh] place-items-center py-16 text-center">
      <div>
        <img src={luma} alt="" className="mx-auto h-28 w-28 opacity-90" />
        <h1 className="mt-4 font-serif text-3xl font-semibold">Page not found</h1>
        <p className="mt-2 text-ink-soft">Mungkin tautannya salah atau halamannya sudah dipindah.</p>
        <Link to="/" className="btn-primary mt-6">Back to Home</Link>
      </div>
    </div>
  );
}

export function Terms() {
  return (
    <div className="container-page max-w-2xl py-10">
      <h1 className="font-serif text-3xl font-semibold">Book sharing terms</h1>
      <div className="prose-lu prose-page mt-6 space-y-4">
        <p>LenteraUmat adalah perpustakaan digital gratis. Setiap buku yang diunggah perlu memenuhi ketentuan berikut.</p>
        <ul>
          <li>Kamu adalah penulis, pemegang hak cipta, atau sudah mendapat izin untuk membagikan buku secara gratis. Buku domain publik dan berlisensi terbuka juga boleh.</li>
          <li>Isi buku tidak mengandung ujaran kebencian, pornografi, atau ajakan kekerasan.</li>
          <li>Data buku (judul, penulis, penerbit) diisi dengan benar.</li>
          <li>Admin berhak menolak, meminta revisi, atau menurunkan buku yang tidak sesuai.</li>
        </ul>
        <p>Ulasan dan diskusi yang menyerang pribadi, berisi spam, atau melanggar ketentuan di atas dapat dihapus admin.</p>
        <p>Jawaban LUMA dibuat oleh AI dan bisa keliru. Selalu periksa kembali ke buku sumber atau guru untuk hal penting, terutama soal hukum agama.</p>
      </div>
    </div>
  );
}

function useContactEmail() {
  const [email, setEmail] = useState("");
  useEffect(() => {
    api.get("/site").then((r) => setEmail(r.contactEmail || "")).catch(() => {});
  }, []);
  return email;
}

function ContactLine({ email, subject }) {
  if (!email) return <p>Hubungi admin lewat tombol Report pada konten yang bersangkutan.</p>;
  return (
    <p>
      Email:{" "}
      <a href={`mailto:${email}?subject=${encodeURIComponent(subject)}`} className="font-semibold text-teal hover:underline">
        {email}
      </a>
    </p>
  );
}

export function Privacy() {
  const email = useContactEmail();
  return (
    <div className="container-page max-w-2xl py-10">
      <h1 className="font-serif text-3xl font-semibold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-ink-mute">Berlaku sejak 18 November 2026</p>
      <div className="prose-lu prose-page mt-6 space-y-4">
        <p>Halaman ini menjelaskan data apa yang disimpan LenteraUmat, untuk apa, dan bagaimana kamu bisa menghapusnya.</p>

        <h2>Data we store</h2>
        <ul>
          <li><b>Akun:</b> nama lengkap, username, email, dan password yang disimpan dalam bentuk acak (hash), bukan teks aslinya.</li>
          <li><b>Profil (opsional):</b> foto, bio, serta tautan Instagram dan LinkedIn yang kamu isi sendiri.</li>
          <li><b>Aktivitas:</b> buku yang kamu unggah dan simpan, halaman terakhir yang dibaca, ulasan, diskusi, balasan, suka, repost, dan laporan yang kamu kirim.</li>
          <li><b>Percakapan dengan LUMA:</b> pesan, lampiran yang kamu kirim, dan jawaban LUMA, supaya riwayatnya bisa dibuka lagi.</li>
        </ul>

        <h2>Third parties involved</h2>
        <ul>
          <li><b>Google Gemini</b> memproses pesan dan lampiran yang kamu kirim ke LUMA untuk membuat jawaban. Lampiran disimpan sementara di Google, lalu terhapus otomatis sekitar 48 jam kemudian.</li>
          <li><b>MongoDB Atlas</b> menyimpan database, dan <b>Cloudinary</b> menyimpan file PDF, sampul, dan foto.</li>
          <li>Email lupa password dikirim lewat <b>Gmail</b>.</li>
        </ul>
        <p>Kami tidak menjual data, tidak memasang iklan, dan tidak memakai pelacak analitik.</p>

        <h2>Cookie</h2>
        <p>
          Cookie dipakai hanya untuk menjaga kamu tetap masuk dan mengingat akun-akun yang pernah masuk di perangkat itu (fitur Ganti akun). Pilihan mode terang/gelap disimpan di browser.
        </p>

        <h2>What is public</h2>
        <p>Nama, username, foto, bio, buku yang sudah tayang, ulasan, diskusi, balasan, dan repost bisa dilihat siapa saja. Email dan percakapan LUMA tidak pernah ditampilkan.</p>

        <h2>Deleting your data</h2>
        <p>
          Di <Link to="/pengaturan" className="font-semibold text-teal hover:underline">Settings</Link>, pilih Delete my account. Akun beserta buku, ulasan, diskusi, balasan, riwayat baca, dan percakapan LUMA milikmu dihapus permanen.
        </p>

        <h2>Contact</h2>
        <ContactLine email={email} subject="Privasi LenteraUmat" />
      </div>
    </div>
  );
}

export function Copyright() {
  const email = useContactEmail();
  return (
    <div className="container-page max-w-2xl py-10">
      <h1 className="font-serif text-3xl font-semibold">Copyright and book takedown</h1>
      <div className="prose-lu prose-page mt-6 space-y-4">
        <p>
          Buku di LenteraUmat diunggah pengguna atau diambil dari koleksi domain publik seperti Internet Archive. Setiap unggahan pengguna ditinjau admin, tetapi kesalahan tetap bisa terjadi. Kalau kamu pemilik hak cipta dan
          karyamu ada di sini tanpa izin, kami akan menurunkannya.
        </p>

        <h2>How to submit a request</h2>
        <ol>
          <li>
            <b>Punya akun:</b> buka halaman buku, tekan <b>Report</b>, pilih <i>Melanggar hak cipta</i>, lalu tulis siapa pemegang haknya dan kontakmu.
          </li>
          <li>
            <b>Tanpa akun:</b> kirim email berisi tautan halaman buku, bukti kepemilikan (misalnya halaman hak cipta atau ISBN atas namamu), dan kontak yang bisa dihubungi.
          </li>
        </ol>
        <ContactLine email={email} subject="Permintaan penurunan buku" />

        <h2>After a report is submitted</h2>
        <p>Buku yang dilaporkan ditinjau paling lambat 3 hari kerja. Kalau laporan terbukti, buku dan file-nya dihapus, dan pengunggah diberi tahu. Pengunggah yang berulang kali melanggar akunnya bisa dinonaktifkan.</p>
        <p>
          Sebelum mengunggah, baca <Link to="/ketentuan" className="font-semibold text-teal hover:underline">Book sharing terms</Link>.
        </p>
      </div>
    </div>
  );
}
