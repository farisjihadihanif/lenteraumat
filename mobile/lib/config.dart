import 'package:flutter/foundation.dart';

/// Alamat API (tanpa /api). Saat build isi dengan:
///   flutter build apk --release --dart-define=API_URL=https://lenteraumat-api.vercel.app
/// Tanpa itu: API lokal (emulator Android menjangkau laptop lewat 10.0.2.2).
const String _fromEnv = String.fromEnvironment('API_URL');

String get apiBase {
  if (_fromEnv.isNotEmpty) return _fromEnv.replaceAll(RegExp(r'/+$'), '');
  if (defaultTargetPlatform == TargetPlatform.android) {
    return 'http://10.0.2.2:4000';
  }
  return 'http://localhost:4000';
}

/// Alamat web, untuk tautan berbagi dan halaman ketentuan.
const String webBase = String.fromEnvironment(
  'WEB_URL',
  defaultValue: 'https://lenteraumat.vercel.app',
);
