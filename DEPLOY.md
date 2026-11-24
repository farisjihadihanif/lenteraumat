# Panduan deploy Lentera Umat

Cara utama: **dua proyek Vercel** dari satu repo. `client/` (web) meneruskan
`/api/*` ke `api/` (Express), jadi di browser semuanya satu domain dan cookie
login tetap cookie pihak pertama. Database di MongoDB Atlas, file di Cloudinary.
Cara VPS ada di bagian bawah.

## Vercel: sebelum mulai

1. **Ganti semua rahasia yang pernah terlihat**, termasuk API key Google
   dari kode lama (`UmmahPatner.jsx`): hapus key itu di Google AI Studio / Cloud
   Console.
2. **Atlas** > Network Access: izinkan `0.0.0.0/0` (IP Vercel berubah-ubah).
   User database cukup *readWrite* ke `lenteraumat`, password panjang dan acak.
3. **Cloudinary** > Settings > Security: centang *Allow delivery of PDF and ZIP
   files*. Tanpa ini unggah buku gagal saat diperiksa.

## Vercel: langkah

1. **Proyek API**: Import repo, *Root Directory* `api`, Framework *Other*. Isi
   environment variables (tabel di bawah), lalu Deploy. Cek
   `https://PROYEK-API.vercel.app/api/health` membalas `{"ok":true}`.
   Samakan *Function Region* dengan region Atlas. Domain produksinya jangan
   dikunci Deployment Protection, karena web harus bisa memanggilnya.
2. **Ganti placeholder** `GANTI-DENGAN-PROYEK-API.vercel.app` di
   `client/vercel.json` dengan domain proyek API, commit, push.
3. **Proyek web**: Import repo yang sama, *Root Directory* `client`, Framework
   *Vite*. Deploy.
4. Kembali ke proyek API: isi `CLIENT_ORIGIN` dan `APP_URL` dengan domain web,
   lalu **Redeploy** (perubahan env baru berlaku setelah deploy ulang).
5. **Uji**: daftar, masuk, *Lupa password*, unggah PDF antara 4,5 dan 10 MB
   (membuktikan unggah langsung), baca buku, tanya LUMA pada buku Internet
   Archive, muat ulang halaman `/katalog` (SPA fallback).

## Vercel: environment variables proyek `api`

| Variabel | Wajib | Keterangan |
|---|---|---|
| `NODE_ENV` | ya | `production` (cookie Secure). |
| `NODEJS_HELPERS` | ya | `0`, supaya Express sendiri yang membaca body. |
| `MONGO_URL` | ya | Connection string Atlas, lengkap dengan nama database. |
| `JWT_SECRET` | ya | Acak, minimal 16 karakter. |
| `CLIENT_ORIGIN` | ya | Domain web, tanpa garis miring di akhir. Pisahkan koma bila lebih dari satu. Dipakai untuk CORS. |
| `APP_URL` | ya | Domain web utama (link di email). |
| `CLOUDINARY_URL` | ya | Vercel tidak punya disk permanen. |
| `GEMINI_API_KEY` | untuk LUMA | |
| `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | untuk lupa password | Gmail + App Password. |
| `ADMIN_EMAIL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` | bila belum ada admin | Admin pertama. |
| `CROSS_SITE_COOKIE` | tidak | Biarkan kosong / `false`. |
| `PUBLIC_API_URL` | tidak | Kosongkan. |
| `CONTACT_EMAIL` | tidak | Kosong = `SMTP_USER`. |
| `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `LUMA_DAILY_LIMIT` | tidak | Default sudah cukup. |
| `CLOUDINARY_MAX_MB`, `MAX_PDF_MB` | tidak | Default `10` dan `40`; yang kecil yang berlaku. |
| `JWT_DAYS`, `SMTP_HOST`, `SMTP_PORT`, `AUTH_RATE_LIMIT`, `RESET_RATE_LIMIT` | tidak | Ada default. |

Jangan diisi di Vercel: `PORT`, `UPLOAD_DIR`, `CLIENT_DIST`, `OLD_MONGO_URL`.
`VERCEL` diisi otomatis oleh Vercel.

## Vercel: environment variables proyek `client`

| Variabel | Wajib | Keterangan |
|---|---|---|
| `VITE_API_URL` | tidak | **Kosongkan.** Web memanggil `/api` di domainnya sendiri. |

Jangan menaruh rahasia di proyek ini; semua `VITE_*` ikut terkirim ke browser.

## Vercel: batas yang perlu diketahui

- **Waktu**: `maxDuration` 120 detik untuk seluruh API (satu fungsi). Rewrite
  web ke API juga dipotong Vercel di 120 detik, jadi angka lebih besar percuma.
  LUMA berhenti sendiri di 110 detik dengan pesan yang jelas.
- **Body 4,5 MB**: PDF dan sampul buku diunggah langsung ke Cloudinary. Foto
  profil, gambar diskusi, dan **lampiran LUMA** masih lewat API. Gambar
  dikecilkan di browser (maks. 1600 px, 4 MB); lampiran LUMA maks. 4 MB total
  per kiriman di Vercel (50 MB per file di luar Vercel).
- **Teks buku untuk LUMA** dibaca saat buku pertama kali ditanyakan, bukan saat
  diunggah. Pertanyaan pertama ke sebuah buku lebih lambat.
- **Batas percobaan** disimpan di memori tiap instance, jadi tidak seketat di satu
  server. Daftar dan lupa password dihitung per IP (lupa password juga per email),
  login per IP + akun. IP dibaca dari `x-real-ip` yang diisi Vercel, juga lewat
  rewrite web ke API. **Cek setelah deploy**: di domain web, kirim *Lupa password*
  beberapa kali dari Wi-Fi lalu sekali dari data seluler, dengan email berbeda.
  Di DevTools > Network, header `RateLimit-Remaining` di jaringan kedua harus
  mulai dari awal (4). Kalau melanjutkan hitungan jaringan pertama, IP asli
  tidak sampai ke API. Kuota harian LUMA tetap akurat karena disimpan di database.
- Unggahan yang batal di tengah jalan bisa tertinggal di folder `lentera-umat/`
  Cloudinary; bersihkan sesekali.
- CSP web ada di `client/vercel.json` (bukan di Express). Sampul boleh dari
  archive.org, Cloudinary, dan https lain; koneksi hanya ke domain sendiri dan
  `api.cloudinary.com`.

---

# Alternatif: satu VPS

Satu VPS menjalankan satu proses Node.js: API Express sekaligus menyajikan
frontend hasil build (`client/dist`). Database di **MongoDB Atlas**, file PDF,
sampul, dan foto di **Cloudinary**, AI lewat **Google Gemini**, email lewat
**Gmail SMTP**. Ganti `domainmu.id` di semua langkah dengan domain asli.

## VPS: kebutuhan

- VPS Ubuntu 22.04/24.04, minimal 1 vCPU dan **2 GB RAM** (pembaca PDF untuk
  LUMA butuh memori), 20 GB disk.
- Node.js 20 atau lebih baru, Nginx, Certbot, PM2, dan `mongodb-database-tools`
  (untuk backup).
- Domain `domainmu.id` dan `www` diarahkan (A record) ke IP VPS.
- Akun yang sudah dipakai di laptop: MongoDB Atlas, Cloudinary, Google AI Studio
  (Gemini), dan Gmail dengan App Password.

## VPS: sebelum deploy

1. **Ganti semua rahasia yang pernah terlihat** (misalnya di screenshot atau
   chat): password database Atlas, `JWT_SECRET`, API key Gemini, dan API secret
   Cloudinary. Yang lama anggap bocor.
2. **Atlas** > Network Access: tambahkan IP VPS. Hapus `0.0.0.0/0` kalau ada.
3. **Atlas** > Database Access: user aplikasi cukup peran *readWrite* ke database
   `lenteraumat`, bukan *atlasAdmin*.
4. **Cloudinary** > Settings > Security: centang *Allow delivery of PDF and ZIP
   files*. Tanpa ini, buku yang tersimpan di Cloudinary tidak bisa dibaca.
5. **Gemini**: di Google AI Studio, pastikan key punya kuota cukup. Kuota gratis
   dibagi untuk semua pengguna; atur batas per orang lewat `LUMA_DAILY_LIMIT`.

## VPS: langkah

1. **Keamanan dasar**: login SSH pakai key, matikan login password dan root,
   aktifkan firewall: `ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw enable`.
   Port 4000 **jangan** dibuka ke publik.
2. **Kode**: salin proyek ke `/srv/lentera-umat` (tanpa `node_modules`, tanpa
   `.env`, tanpa `api/uploads`), lalu:
   ```bash
   cd /srv/lentera-umat/client && npm ci && npm run build
   cd /srv/lentera-umat/api && npm ci --omit=dev
   ```
3. **Konfigurasi**: `cp api/.env.example api/.env`, isi semua nilai (tabel di
   bawah), lalu `chmod 600 api/.env`.
4. **Jalankan dengan PM2**:
   ```bash
   sudo mkdir -p /var/log/lentera-umat && sudo chown $USER /var/log/lentera-umat
   pm2 start deploy/ecosystem.config.js
   pm2 save && pm2 startup
   pm2 logs lentera-umat --lines 20   # harus ada "MongoDB tersambung" dan "LUMA: aktif"
   ```
   Cukup **1 proses**. Jangan pakai mode cluster (batas percobaan login dan
   batas LUMA per menit disimpan di memori proses).
5. **Nginx + HTTPS**: salin `deploy/nginx-lentera-umat.conf` ke
   `/etc/nginx/sites-available/domainmu.id`, ganti nama domainnya, aktifkan
   (`ln -s` ke `sites-enabled`), `sudo nginx -t && sudo systemctl reload nginx`,
   lalu `sudo certbot --nginx -d domainmu.id -d www.domainmu.id`.
   HTTPS wajib: cookie login hanya dikirim lewat HTTPS di mode production.
6. **Backup harian**: `deploy/backup.sh` lewat cron (contoh di dalam file).
   Atlas paket gratis (M0) tidak punya backup otomatis, jadi skrip ini penting.
   Simpan juga salinan ke luar VPS (misalnya Google Drive lewat rclone).
7. **Pemantauan**: daftarkan `https://domainmu.id/api/health` di UptimeRobot
   (gratis) supaya ada notifikasi kalau situs mati. Rotasi log:
   `pm2 install pm2-logrotate`.
8. **Uji setelah online**: daftar akun baru, coba *Lupa password* (email harus
   masuk), unggah buku kecil, baca buku, tanya LUMA, buat kuis, kirim laporan,
   lalu cek tab *Laporan* di dasbor admin.

## VPS: isi `api/.env`

| Variabel | Keterangan |
|---|---|
| `NODE_ENV` | Tidak perlu diisi di `.env`; PM2 sudah memberi `production`. |
| `MONGO_URL` | Connection string Atlas (`mongodb+srv://...`), dengan password baru. |
| `JWT_SECRET` | Teks acak panjang: `openssl rand -hex 32`. Jangan sama dengan di laptop. |
| `JWT_DAYS` | Lama sesi login, mis. `7`. |
| `PORT` | `4000` (Nginx meneruskan ke sini). |
| `CLIENT_ORIGIN` | `https://domainmu.id,https://www.domainmu.id` |
| `CROSS_SITE_COOKIE` | `false` (web dan API satu domain). |
| `APP_URL` | `https://domainmu.id` (untuk link di email lupa password). |
| `PUBLIC_API_URL` | Kosongkan (web dan API satu domain). |
| `ADMIN_EMAIL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Admin pertama, dibuat otomatis kalau belum ada admin. Setelah login, ganti password lewat Pengaturan. |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` | LUMA. Model default sudah cukup. |
| `LUMA_DAILY_LIMIT` | Batas permintaan LUMA per user per hari (admin bebas). Default `40`. |
| `CLOUDINARY_URL`, `CLOUDINARY_MAX_MB` | Penyimpanan file. Paket gratis: `10`. |
| `MAX_PDF_MB` | Batas unggah PDF, default `40`. |
| `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Gmail + App Password 16 huruf. |
| `CONTACT_EMAIL` | Email di halaman Privasi dan Hak cipta. Kosong = `SMTP_USER`. |

## VPS: update aplikasi

```bash
cd /srv/lentera-umat
./deploy/backup.sh                  # backup dulu
# salin kode baru (jangan timpa api/.env dan api/uploads)
cd client && npm ci && npm run build && cd ..
cd api && npm ci --omit=dev && cd ..
pm2 restart lentera-umat
```

## VPS: yang perlu diketahui

- **Rahasia hanya di server.** Key Gemini, Cloudinary, dan SMTP tidak pernah
  dikirim ke browser. Jangan menaruhnya di `client/` atau di variabel `VITE_*`.
- **Buku impor Internet Archive** tidak disalin ke Cloudinary; file-nya dibaca
  langsung dari archive.org. Kalau archive.org sedang lambat, buku itu ikut
  lambat dibuka.
- **Atlas M0** dibatasi 512 MB. Teks buku untuk LUMA ikut tersimpan di
  database, jadi pantau ukurannya di dasbor Atlas setelah impor banyak buku.
- **Batas LUMA per hari** reset pukul 00.00 WIB. Ubah `LUMA_DAILY_LIMIT` lalu
  `pm2 restart lentera-umat`.
