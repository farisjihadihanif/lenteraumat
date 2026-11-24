# LenteraUmat (mobile, Flutter, Android)

```bash
flutter pub get
flutter run --dart-define=API_URL=http://10.0.2.2:4000   # emulator ke API lokal
flutter test
flutter analyze
flutter build apk --release --split-per-abi --target-platform android-arm64,android-arm --dart-define=API_URL=https://lenteraumat-api.vercel.app
```

Kunci rilis: salin `android/key.properties.example` menjadi `android/key.properties` (tidak di-commit).
Tanpa berkas itu APK rilis memakai kunci debug dan **tidak boleh dipublikasikan**.

Uji langsung (butuh internet, hanya membaca): `tool/reader_proof_test.dart`, `tool/screens_live_test.dart`.
Uji terhadap API sekali pakai: `node tool/api_sementara.js`, lalu `tool/session_live_test.dart` dan `tool/contract_live_test.dart`.

GitHub Releases: unggah `app-arm64-v8a-release.apk` (kebanyakan HP) dan `app-armeabi-v7a-release.apk` (HP lama).
Buku dibuka per potongan; sisanya diunduh di latar hanya lewat Wi-Fi, kecuali *Download whole book on mobile data* dinyalakan.
