# Deploy

Dua proyek Vercel dari satu repo: `api/` (`lenteraumat-api`) dan `client/` (`lenteraumat`).

## Perubahan API untuk aplikasi mobile

Login aplikasi baru berfungsi di produksi setelah perubahan ini di-push dan proyek **API** di-deploy ulang.
Web tidak perlu di-deploy ulang. Tidak ada perubahan database.

- Header `X-Client: mobile` pada `POST /api/auth/register`, `POST /api/auth/login`, dan
  `PUT /api/users/me/password`: balasan berisi `token` dan tidak memasang cookie. Web tetap memakai cookie httpOnly.
- `Authorization: Bearer` didahulukan dari cookie.
- `GET /api/auth/me` dengan Bearer + `X-Client: mobile`: membalas token baru (umur `JWT_DAYS`), atau 401 bila token mati.
- `X-Client` tidak ada di daftar header CORS, dan diabaikan untuk permintaan yang membawa `Origin` atau
  `Sec-Fetch-Site`, jadi halaman web tidak bisa meminta token.

Variabel opsional: `REFRESH_RATE_LIMIT` (perpanjangan token per 15 menit, bawaan sama dengan `AUTH_RATE_LIMIT` = 20).

Cek sesudah deploy (harus 401; versi lama membalas 200):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -H "X-Client: mobile" -H "Authorization: Bearer x" https://lenteraumat-api.vercel.app/api/auth/me
```
