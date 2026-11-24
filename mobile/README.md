# LenteraUmat (mobile, Flutter, Android)

```bash
flutter pub get
flutter run --dart-define=API_URL=http://10.0.2.2:4000   # emulator ke API lokal
flutter test
flutter analyze
flutter build apk --release --dart-define=API_URL=https://lenteraumat-api.vercel.app
```

Kunci rilis: salin `android/key.properties.example` menjadi `android/key.properties` (tidak di-commit).
Tanpa berkas itu APK rilis memakai kunci debug dan **tidak boleh dipublikasikan**.

Uji langsung (butuh internet, hanya membaca): `tool/reader_proof_test.dart`, `tool/screens_live_test.dart`.
Uji masuk terhadap API sekali pakai: `tool/session_live_test.dart`.
