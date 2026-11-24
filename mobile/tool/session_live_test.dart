// Uji masuk terhadap API lokal sekali pakai (bukan produksi):
//   node tool/api_sementara.js   lalu   flutter test tool/session_live_test.dart --dart-define=API_URL=http://localhost:4555
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:lenteraumat/api.dart';
import 'package:lenteraumat/config.dart';
import 'package:lenteraumat/state.dart';

void main() {
  test('daftar, perpanjang, ganti password, hapus akun', () async {
    expect(Uri.parse(apiBase).host, 'localhost');
    HttpOverrides.global = null;
    final store = MemorySecretStore();
    AppState make() => AppState(ApiClient(secrets: store));
    final s = make();
    await s.register({
      'namaLengkap': 'Uji',
      'username': 'uji',
      'email': 'uji@lu.id',
      'password': 'rahasia123',
    });
    expect(s.signedIn, isTrue);
    final lagi = make();
    await lagi.bootstrap();
    expect(lagi.user?['username'], 'uji');
    final lama = store.isi['auth_token']!;
    await lagi.changePassword('rahasia123', 'rahasia456');
    expect(store.isi['auth_token'], isNot(lama));
    await lagi.api.get('/books/mine');
    // Token lama mati di server: aplikasi menghapusnya.
    final mati = AppState(
      ApiClient(secrets: MemorySecretStore({'auth_token': lama})),
    );
    await mati.bootstrap();
    expect(mati.api.token, isNull);
    await lagi.deleteAccount('rahasia456');
    expect(store.isi, isEmpty);
  });
}
