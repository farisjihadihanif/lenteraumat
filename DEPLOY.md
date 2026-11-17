# Panduan deploy Lentera Umat

Satu VPS menjalankan satu proses Node.js: API Express sekaligus menyajikan
frontend hasil build (`client/dist`). Database di **MongoDB Atlas**, file PDF,
sampul, dan foto di **Cloudinary**, AI lewat **Google Gemini**, email lewat
**Gmail SMTP**. Ganti `domainmu.id` di semua langkah dengan domain asli.

## Kebutuhan

- VPS Ubuntu 22.04/24.04, minimal 1 vCPU dan **2 GB RAM** (pembaca PDF untuk
  LUMA butuh memori), 20 GB disk.
- Node.js 20 atau lebih baru, Nginx, Certbot, PM2, dan `mongodb-database-tools`
  (untuk backup).
- Domain `domainmu.id` dan `www` diarahkan (A record) ke IP VPS.
- Akun yang sudah dipakai di laptop: MongoDB Atlas, Cloudinary, Google AI Studio
  (Gemini), dan Gmail dengan App Password.

## Sebelum deploy

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

## Langkah

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

## Isi `api/.env`

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

## Update aplikasi

```bash
cd /srv/lentera-umat
./deploy/backup.sh                  # backup dulu
# salin kode baru (jangan timpa api/.env dan api/uploads)
cd client && npm ci && npm run build && cd ..
cd api && npm ci --omit=dev && cd ..
pm2 restart lentera-umat
```

## Yang perlu diketahui

- **Rahasia hanya di server.** Key Gemini, Cloudinary, dan SMTP tidak pernah
  dikirim ke browser. Jangan menaruhnya di `client/` atau di variabel `VITE_*`.
- **Buku impor Internet Archive** tidak disalin ke Cloudinary; file-nya dibaca
  langsung dari archive.org. Kalau archive.org sedang lambat, buku itu ikut
  lambat dibuka.
- **Atlas M0** dibatasi 512 MB. Teks buku untuk LUMA ikut tersimpan di
  database, jadi pantau ukurannya di dasbor Atlas setelah impor banyak buku.
- **Batas LUMA per hari** reset pukul 00.00 WIB. Ubah `LUMA_DAILY_LIMIT` lalu
  `pm2 restart lentera-umat`.
