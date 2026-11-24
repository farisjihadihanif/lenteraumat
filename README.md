# LenteraUmat

Perpustakaan digital dengan maskot **LUMA** (AI).

## Fitur

- **Dua peran:** `user` dan `admin`.
- **Unggah buku (PDF):** user mengunggah → status _menunggu_ → admin **setujui / minta revisi / tolak** (wajib catatan). Buku dari admin langsung tayang. Sampul otomatis dari halaman pertama PDF kalau tidak memilih gambar.
- **Baca buku:** halaman detail menampilkan cuplikan beberapa halaman awal; tombol **Baca buku** membuka _flipbook_ dengan animasi balik halaman seperti buku cetak (dua halaman di layar lebar, satu halaman di HP, geser/klik/tombol panah keyboard, slider halaman, layar penuh). Halaman terakhir disimpan otomatis (fitur _Lanjut membaca_).
- **Ulasan:** rating 1–5 bintang + komentar (satu ulasan per user per buku), rata-rata & distribusi rating. Admin bisa menghapus ulasan.
- **Diskusi:** pengganti Artikel. Diskusi bisa dikaitkan ke buku tertentu dan dibalas pembaca lain.
- **LUMA AI** (Google Gemini, lewat server): chat, tanya isi buku (LUMA membaca teks PDF), ringkasan, kuis pilihan ganda/isian yang bisa langsung dikerjakan. Riwayat percakapan tersimpan.
- **Rak saya:** lanjut membaca, buku disimpan, status unggahan.
- **Dasbor admin:** ringkasan, buku masuk, semua buku, impor buku, kategori, ulasan, pengguna (ubah peran / hapus).
- **Mode terang/gelap** (tombol matahari/bulan di navbar, tersimpan di browser).

## Struktur

```
api/
client/
```

## Website

Website Deployment on: https://lenteraumat.vercel.app/

## LUMA (Gemini)

- LUMA hanya bisa membaca PDF yang berisi teks. PDF hasil scan (gambar) tetap bisa dibaca manusia di flipbook, tapi LUMA akan memberi tahu bahwa teksnya tidak terbaca.

## Mengisi buku dari sumber terbuka

Hanya buku yang memang boleh disebarkan ulang: domain publik, lisensi terbuka (Creative Commons), atau buku pemerintah yang dibagikan gratis. **Jangan** salin skripsi/tesis dari repositori kampus atau buku dari layanan pinjam (iPusnas, dll).

Mode bawaan **cepat**: cukup memanggil API Internet Archive (judul, penulis, sampul, jumlah halaman, tautan PDF) — 50 buku selesai dalam hitungan detik. PDF tidak diunduh; saat dibaca, server hanya mengambil bagian halaman yang sedang dibuka (HTTP Range). Teks untuk LUMA diambil saat buku itu pertama kali dipakai di LUMA.
Skrip hanya mengambil dari koleksi lembaga tepercaya (Smithsonian Libraries, Library of Congress, perpustakaan universitas), terbit 1500–1928 menurut tahun jilidnya sendiri. Dilewati: tahun atau hak cipta yang tidak pasti, okultisme, kebencian, misinformasi kesehatan, konten dewasa, dan karya yang sudah ada (maksimal 2 jilid per judul berseri). Kategori ditentukan otomatis dari subjek buku; sumber & lisensi dicatat. Aman dijalankan berulang (tidak ada duplikat).

- **Sampul otomatis:** Dasbor admin → Semua buku → **Sampul otomatis** (untuk buku yang belum bersampul).
- **Kategori:** Dasbor admin → **Kategori** (tambah, ganti nama, hapus — buku di kategori yang dihapus pindah ke "Umum").

**Catatan Cloudinary gratis:** batas 10 MB per file. PDF hasil impor yang lebih besar otomatis _ditautkan_ ke sumber aslinya (tidak disalin). Aktifkan juga **Allow delivery of PDF and ZIP files** di Cloudinary supaya PDF bisa dibaca.

`

## Copyright

© 2026 Faris Jihadi Hanif Lubis. All rights reserved.

This repository is public for portfolio and review purposes only. No license is granted: you may view the code, but you may not copy, modify, redistribute, or use it in other projects without my written permission.

Repositori ini dipublikasikan hanya untuk keperluan portofolio. Kode boleh dilihat, tetapi tidak boleh disalin, diubah, disebarkan, atau digunakan tanpa izin tertulis dari saya.

Contact: [LinkedIn](https://www.linkedin.com/in/faris-jihadi-hanif-lubis-62337a286/)
