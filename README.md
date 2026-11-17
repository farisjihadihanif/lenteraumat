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
- **Dasbor admin:** ringkasan, buku masuk, semua buku, ulasan, pengguna (ubah peran / hapus).

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

## Deploy (satu server)
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

## Pindah data dari versi lama
```bash
cd api
OLD_MONGO_URL="mongodb+srv://…/database-lama" npm run migrate:lama
```
Komunitas/donatur → user, admin tetap admin, password lama tetap bisa dipakai, Ebook → Buku (file tetap di Cloudinary lama), Artikel → Diskusi. Data donasi tidak dipindahkan. Aman dijalankan berulang.

## Tes
```bash
cd api && npm test        # 21 tes API (MongoDB di memori, LUMA tiruan)
cd client && npm run lint && npm run build
```
