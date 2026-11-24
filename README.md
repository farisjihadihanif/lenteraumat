# LenteraUmat — Perpustakaan Digital

Perpustakaan digital Islami dengan maskot **LUMA** (AI). Versi pribadi Faris, tanpa fitur donasi.

## Fitur
- **Dua peran:** `user` dan `admin`.
- **Unggah buku (PDF):** user mengunggah → status *menunggu* → admin **setujui / minta revisi / tolak** (wajib catatan). Buku dari admin langsung tayang. Sampul otomatis dari halaman pertama PDF kalau tidak memilih gambar.
- **Baca buku:** halaman detail menampilkan cuplikan beberapa halaman awal; tombol **Baca buku** membuka *flipbook* dengan animasi balik halaman seperti buku cetak (dua halaman di layar lebar, satu halaman di HP, geser/klik/tombol panah keyboard, slider halaman, layar penuh). Halaman terakhir disimpan otomatis (fitur *Lanjut membaca*).
- **Ulasan:** rating 1–5 bintang + komentar (satu ulasan per user per buku), rata-rata & distribusi rating. Admin bisa menghapus ulasan.
- **Diskusi:** pengganti Artikel. Diskusi bisa dikaitkan ke buku tertentu dan dibalas pembaca lain.
- **LUMA AI** (Google Gemini, lewat server): chat, tanya isi buku (LUMA membaca teks PDF), ringkasan, kuis pilihan ganda/isian yang bisa langsung dikerjakan. Riwayat percakapan tersimpan.
- **Rak saya:** lanjut membaca, buku disimpan, status unggahan.
- **Dasbor admin:** ringkasan, buku masuk, semua buku, impor buku, kategori, ulasan, pengguna (ubah peran / hapus).
- **Mode terang/gelap** (tombol matahari/bulan di navbar, tersimpan di browser).

## Struktur
```
api/     Express 5 + MongoDB (Mongoose) — REST API di /api, JWT di cookie httpOnly
client/  React 19 + Vite + Tailwind — pdf.js untuk render halaman, page-flip untuk flipbook
```

## Menjalankan di laptop
1. **API**
   ```bash
   cd api
   cp .env.example .env      # lalu isi MONGO_URL, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, GEMINI_API_KEY
   npm install
   npm run dev               # http://localhost:4000
   ```
   Akun admin pertama dibuat otomatis dari `ADMIN_EMAIL` + `ADMIN_PASSWORD`.
2. **Web**
   ```bash
   cd client
   npm install
   npm run dev               # http://localhost:5173 (otomatis meneruskan /api ke port 4000)
   ```

## Deploy
Panduan lengkap, termasuk dua proyek Vercel (`api/` dan `client/`) dan daftar environment variables: **[DEPLOY.md](DEPLOY.md)**. Untuk satu VPS, ringkasnya:
```bash
cd client && npm ci && npm run build      # hasil di client/dist
cd ../api && npm ci --omit=dev && NODE_ENV=production node index.js
```
Server API otomatis menyajikan `client/dist`, jadi web & API cukup satu domain (mis. di VPS dengan PM2 + nginx).
- File buku disimpan di `api/uploads/` (pastikan folder ini ikut di-backup), **atau** isi `CLOUDINARY_URL` untuk menyimpan di Cloudinary (wajib kalau hosting tidak punya disk permanen seperti Render/Railway).
- Kalau frontend & API beda domain: isi `CLIENT_ORIGIN` dan `CROSS_SITE_COOKIE=true` di API, dan `VITE_API_URL` di client.

## LUMA (Gemini)
- Buat API key di Google AI Studio, isi `GEMINI_API_KEY` di `api/.env`. **Key tidak pernah dikirim ke browser.**
- `GEMINI_MODEL` default `gemini-flash-latest` (selalu mengikuti model Flash terbaru).
- LUMA hanya bisa membaca PDF yang berisi teks. PDF hasil scan (gambar) tetap bisa dibaca manusia di flipbook, tapi LUMA akan memberi tahu bahwa teksnya tidak terbaca.

## Mengisi buku dari sumber terbuka
Hanya buku yang memang boleh disebarkan ulang: domain publik, lisensi terbuka (Creative Commons), atau buku pemerintah yang dibagikan gratis. **Jangan** salin skripsi/tesis dari repositori kampus atau buku dari layanan pinjam (iPusnas, dll).

- **Satu per satu:** Dasbor admin → **Impor buku**. Tempel tautan PDF (mis. dari SIBI Kemendikdasmen), isi judul, penulis, kategori, **sumber** dan **lisensi**. Buku langsung tayang dengan atribusi dan sampul dibuat otomatis dari halaman pertama.
- **Banyak sekaligus (domain publik, Internet Archive):** buka **terminal kedua** (server `npm run dev` tetap jalan di terminal pertama), lalu di folder `api`
  ```bash
  npm run impor:arsip -- --jumlah 50                      # uji coba: lihat daftar, tidak menyimpan
  npm run impor:arsip -- --topik islam --jumlah 50 --simpan   # tampilkan daftar, lalu simpan
  npm run impor:arsip -- --topik "natural history" --jumlah 30
  npm run impor:arsip -- --bahasa melayu --jumlah 20       # inggris | indonesia | melayu | arab | belanda
  npm run indeks:teks                                     # daftar buku yang teksnya belum siap untuk LUMA
  npm run indeks:teks -- --simpan                         # unduh & simpan teksnya (bisa dihentikan dan dilanjutkan)
  npm run impor:arsip -- --topik islam --simpan --salin    # unduh & simpan salinan PDF (lambat)
  ```
  Mode bawaan **cepat**: cukup memanggil API Internet Archive (judul, penulis, sampul, jumlah halaman, tautan PDF) — 50 buku selesai dalam hitungan detik. PDF tidak diunduh; saat dibaca, server hanya mengambil bagian halaman yang sedang dibuka (HTTP Range). Teks untuk LUMA diambil saat buku itu pertama kali dipakai di LUMA.
  Skrip hanya mengambil dari koleksi lembaga tepercaya (Smithsonian Libraries, Library of Congress, perpustakaan universitas), terbit 1500–1928 menurut tahun jilidnya sendiri. Dilewati: tahun atau hak cipta yang tidak pasti, okultisme, kebencian, misinformasi kesehatan, konten dewasa, dan karya yang sudah ada (maksimal 2 jilid per judul berseri). Kategori ditentukan otomatis dari subjek buku; sumber & lisensi dicatat. Aman dijalankan berulang (tidak ada duplikat).
- **Sampul otomatis:** Dasbor admin → Semua buku → **Sampul otomatis** (untuk buku yang belum bersampul).
- **Kategori:** Dasbor admin → **Kategori** (tambah, ganti nama, hapus — buku di kategori yang dihapus pindah ke "Umum").

**Catatan Cloudinary gratis:** batas 10 MB per file. PDF hasil impor yang lebih besar otomatis *ditautkan* ke sumber aslinya (tidak disalin). Aktifkan juga **Settings → Security → Allow delivery of PDF and ZIP files** di Cloudinary supaya PDF bisa dibaca.

## Pindah data dari versi lama
```bash
cd api
OLD_MONGO_URL="mongodb+srv://…/database-lama" npm run migrate:lama
```
Komunitas/donatur → user, admin tetap admin, password lama tetap bisa dipakai, Ebook → Buku (file tetap di Cloudinary lama), Artikel → Diskusi. Data donasi tidak dipindahkan. Aman dijalankan berulang.

## Tes
```bash
cd api && npm test        # tes API (MongoDB di memori, LUMA tiruan)
cd client && npm run lint && npm run build
```

## Copyright

© 2026 Faris Jihadi Hanif Lubis. All rights reserved.

This repository is public for portfolio and review purposes only. No license is granted: you may view the code, but you may not copy, modify, redistribute, or use it in other projects without my written permission.

Repositori ini dipublikasikan hanya untuk keperluan portofolio. Kode boleh dilihat, tetapi tidak boleh disalin, diubah, disebarkan, atau digunakan tanpa izin tertulis dari saya.

Contact: [LinkedIn](https://www.linkedin.com/in/faris-jihadi-hanif-lubis-62337a286/)
