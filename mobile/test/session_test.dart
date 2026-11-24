import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lenteraumat/api.dart';
import 'package:lenteraumat/state.dart';

const faris = {'_id': 'u1', 'username': 'faris', 'role': 'user'};

http.Response js(Object body, [int status = 200]) => http.Response(
  jsonEncode(body),
  status,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

void main() {
  late MemorySecretStore store;
  late List<http.Request> sent;

  AppState make(http.Response Function(http.Request r) balas) {
    sent = [];
    return AppState(
      ApiClient(
        baseUrl: 'https://api.test',
        secrets: store,
        client: MockClient((r) async {
          sent.add(r);
          return balas(r);
        }),
      ),
    );
  }

  Map<String, String> sesi() => {
    'auth_token': 'lama',
    'auth_user': jsonEncode(faris),
  };

  setUp(() => store = MemorySecretStore());

  test('masuk: header aplikasi, token disimpan, dipakai berikutnya', () async {
    final s = make((r) => js({'user': faris, 'token': 't1'}));
    await s.login('faris', 'rahasia123');
    expect(sent.single.headers['X-Client'], 'mobile');
    expect(sent.single.headers.containsKey('Authorization'), isFalse);
    expect(store.isi['auth_token'], 't1');
    await s.api.get('/books/mine');
    expect(sent.last.headers['Authorization'], 'Bearer t1');
  });

  test('API lama tanpa token: tidak dianggap masuk', () async {
    final s = make((r) => js({'user': faris}));
    await expectLater(
      s.login('faris', 'rahasia123'),
      throwsA(isA<ApiException>()),
    );
    expect(s.signedIn, isFalse);
    expect(store.isi, isEmpty);
  });

  test('password salah: pesan server, tidak ada yang tersimpan', () async {
    final s = make((r) => js({'message': 'Salah.'}, 401));
    await expectLater(
      s.login('a', 'b'),
      throwsA(isA<ApiException>().having((e) => e.message, 'pesan', 'Salah.')),
    );
    expect(store.isi, isEmpty);
  });

  test('buka aplikasi: token diperpanjang', () async {
    store = MemorySecretStore(sesi());
    final s = make((r) => js({'user': faris, 'token': 'baru'}));
    await s.bootstrap();
    expect(sent.single.url.path, '/api/auth/me');
    expect(sent.single.headers['Authorization'], 'Bearer lama');
    expect(store.isi['auth_token'], 'baru');
    expect(s.signedIn, isTrue);
  });

  for (final status in [429, 500, 503]) {
    test('perpanjangan $status: tetap masuk', () async {
      store = MemorySecretStore(sesi());
      final s = make((r) => js({'message': 'x'}, status));
      await s.bootstrap();
      expect(s.signedIn, isTrue);
      expect(store.isi['auth_token'], 'lama');
    });
  }

  test('tanpa jaringan: tetap masuk', () async {
    store = MemorySecretStore(sesi());
    final s = make((r) => throw http.ClientException('putus'));
    await s.bootstrap();
    expect(s.user?['username'], 'faris');
  });

  test('401 menghapus token dan profil tersimpan', () async {
    store = MemorySecretStore(sesi());
    final s = make((r) => js({'message': 'Sesi berakhir.'}, 401));
    await s.bootstrap();
    expect(s.signedIn, isFalse);
    expect(store.isi, isEmpty);
  });

  test('401 di permintaan lain juga mengeluarkan akun', () async {
    final s = make(
      (r) => r.url.path.endsWith('/login')
          ? js({'user': faris, 'token': 't1'})
          : js({'message': 'x'}, 401),
    );
    await s.login('faris', 'rahasia123');
    await expectLater(s.api.get('/books/saved'), throwsA(isA<ApiException>()));
    await pumpEventQueue();
    expect(s.signedIn, isFalse);
    expect(store.isi, isEmpty);
  });

  test('401 untuk token lama tidak menghapus token baru', () async {
    final s = make((r) => js({'message': 'x'}, 401));
    await s.api.setToken('lama');
    final f = s.api.get('/books/saved');
    await s.api.setToken('baru');
    await expectLater(f, throwsA(isA<ApiException>()));
    expect(store.isi['auth_token'], 'baru');
  });

  test('hapus akun menghapus token; password salah tidak', () async {
    store = MemorySecretStore(sesi());
    var ok = false;
    final s = make((r) {
      if (r.method == 'GET') return js({'user': faris, 'token': 't'});
      return ok ? js({'ok': true}) : js({'message': 'Password salah.'}, 400);
    });
    await s.bootstrap();
    await expectLater(s.deleteAccount('x'), throwsA(isA<ApiException>()));
    expect(s.signedIn, isTrue);
    ok = true;
    await s.deleteAccount('rahasia123');
    expect(s.signedIn, isFalse);
    expect(store.isi, isEmpty);
  });

  test('ganti password menyimpan token baru', () async {
    store = MemorySecretStore(sesi());
    final s = make(
      (r) => r.method == 'PUT'
          ? js({'ok': true, 'token': 'baru'})
          : js({'user': faris}),
    );
    await s.bootstrap();
    await s.changePassword('a', 'b');
    expect(store.isi['auth_token'], 'baru');
  });
}
