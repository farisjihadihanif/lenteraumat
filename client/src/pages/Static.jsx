import { Link } from "react-router-dom";
import luma from "../assets/Maskot/Luma1.png";

export function NotFound() {
  return (
    <div className="container-page grid min-h-[60vh] place-items-center py-16 text-center">
      <div>
        <img src={luma} alt="" className="mx-auto h-28 w-28 opacity-90" />
        <h1 className="mt-4 font-serif text-3xl font-semibold">Halaman tidak ditemukan</h1>
        <p className="mt-2 text-ink-soft">Mungkin tautannya salah atau halamannya sudah dipindah.</p>
        <Link to="/" className="btn-primary mt-6">Kembali ke beranda</Link>
      </div>
    </div>
  );
}

export function Terms() {
  return (
    <div className="container-page max-w-2xl py-10">
      <h1 className="font-serif text-3xl font-semibold">Ketentuan berbagi buku</h1>
      <div className="prose-lu mt-6 space-y-4">
        <p>Lentera Umat adalah perpustakaan digital gratis. Setiap buku yang diunggah perlu memenuhi ketentuan berikut.</p>
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
