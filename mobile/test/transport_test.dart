import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:lenteraumat/api.dart';

/// Klien palsu yang melihat permintaan apa adanya (termasuk isi multipart).
class Fake extends http.BaseClient {
  Fake(this.reply);
  final FutureOr<http.StreamedResponse> Function(
    http.BaseRequest r,
    String body,
  )
  reply;
  final sent = <(http.BaseRequest, String)>[];

  @override
  Future<http.StreamedResponse> send(http.BaseRequest r) async {
    final body = latin1.decode(await r.finalize().toBytes());
    sent.add((r, body));
    return reply(r, body);
  }
}

http.StreamedResponse js(Object o, [int status = 200]) => http.StreamedResponse(
  Stream.value(utf8.encode(jsonEncode(o))),
  status,
  headers: {'content-type': 'application/json'},
);

http.StreamedResponse sse(Stream<List<int>> s) => http.StreamedResponse(
  s,
  200,
  headers: {'content-type': 'text/event-stream; charset=utf-8'},
);

String ev(Object o) => 'data: ${jsonEncode(o)}\n\n';

void main() {
  late Fake fake;
  ApiClient api(
    FutureOr<http.StreamedResponse> Function(http.BaseRequest r, String b) f,
  ) => ApiClient(
    baseUrl: 'https://api.test',
    secrets: MemorySecretStore(),
    client: fake = Fake(f),
  );

  group('LUMA streaming', () {
    test(
      'teks menumpuk, reset, done; potongan di tengah huruf UTF-8',
      () async {
        final bytes = utf8.encode(
          ev({'text': 'sala'}) +
              ev({'reset': true}) +
              ev({'text': 'Insya Allah “'}) +
              ev({'text': 'é”'}) +
              ev({
                'done': {'reply': 'selesai', 'sessionId': 's1'},
              }),
        );
        final a = api(
          (r, b) => sse(
            Stream.fromIterable([
              for (final x in bytes) [x],
            ]),
          ),
        );
        final seen = <String>[];
        final r = await a.stream(
          '/ai/chat',
          body: {'message': 'hai', 'sessionId': null},
          onText: seen.add,
        );
        expect(seen, ['sala', '', 'Insya Allah “', 'Insya Allah “é”']);
        expect(r['sessionId'], 's1');
        expect(fake.sent.single.$1.headers['Accept'], 'text/event-stream');
      },
    );

    test('galat di tengah aliran tidak diulang', () async {
      final a = api(
        (r, b) => sse(
          Stream.value(
            utf8.encode(
              ev({'text': 'x'}) +
                  ev({
                    'error': {'status': 502, 'message': 'LUMA sibuk.'},
                  }),
            ),
          ),
        ),
      );
      await expectLater(
        a.stream('/ai/chat', body: {'message': 'x'}, onText: (_) {}),
        throwsA(
          isA<ApiException>().having((e) => e.message, 'm', 'LUMA sibuk.'),
        ),
      );
      expect(fake.sent.length, 1);
    });

    test('galat sebelum aliran (JSON biasa) tidak diulang', () async {
      final a = api((r, b) => js({'message': 'Batas habis.'}, 429));
      await expectLater(
        a.stream('/ai/chat', body: {'message': 'x'}, onText: (_) {}),
        throwsA(isA<ApiException>().having((e) => e.status, 's', 429)),
      );
      expect(fake.sent.length, 1);
    });

    test('aliran putus: diulang sekali tanpa streaming', () async {
      final a = api(
        (r, b) => r.headers['Accept'] == 'text/event-stream'
            ? sse(Stream.value(utf8.encode(ev({'text': 'setengah'}))))
            : js({'reply': 'utuh', 'sessionId': 's'}),
      );
      final seen = <String>[];
      final r = await a.stream(
        '/ai/summary',
        body: {'bookId': 'b'},
        onText: seen.add,
      );
      expect(r['reply'], 'utuh');
      expect(seen, ['setengah', '']);
      expect(fake.sent.length, 2);
    });

    test('luring: tidak diulang', () async {
      final a = api((r, b) => throw http.ClientException('putus'));
      await expectLater(
        a.stream('/ai/chat', body: {'message': 'x'}, onText: (_) {}),
        throwsA(isA<ApiException>().having((e) => e.status, 's', 0)),
      );
      expect(fake.sent.length, 1);
    });
  });

  group('unggah buku', () {
    late Directory dir;
    late FormFile pdf, cover;
    setUp(() async {
      dir = await Directory.systemTemp.createTemp('lu-up');
      FormFile mk(String n, String type) {
        final f = File('${dir.path}/$n')..writeAsStringSync('%PDF-isi-$n');
        return FormFile(
          field: '',
          path: f.path,
          name: n,
          type: type,
          size: f.lengthSync(),
        );
      }

      pdf = mk('a.pdf', 'application/pdf');
      cover = mk('c.png', 'image/png');
    });
    tearDown(() => dir.delete(recursive: true));

    test('langsung ke Cloudinary tanpa token; bukti dikirim ke API', () async {
      final a = api((r, b) {
        if (r.url.path.endsWith('/sign')) {
          return js({
            'direct': true,
            'url': 'https://api.cloudinary.com/v1_1/x/raw/upload',
            'fields': {'public_id': 'p', 'timestamp': 12, 'signature': 'ttd'},
          });
        }
        if (r.url.host == 'api.cloudinary.com') {
          return js({
            'public_id': 'p',
            'version': 7,
            'signature': 'bukti',
            'secure_url': 'https://jahat.test/x',
          });
        }
        return js({
          'book': {'_id': 'b1', 'status': 'menunggu'},
        });
      });
      await a.setToken('rahasia');
      final prog = <double>[];
      final r = await saveBook(
        a,
        fields: {'judul': 'J'},
        pdf: pdf,
        cover: cover,
        onProgress: prog.add,
      );
      expect((r['book'] as Json)['status'], 'menunggu');
      final cloud = fake.sent
          .where((s) => s.$1.url.host == 'api.cloudinary.com')
          .toList();
      expect(cloud.length, 2);
      for (final (q, body) in cloud) {
        expect(
          q.headers.keys.map((k) => k.toLowerCase()),
          isNot(contains('authorization')),
        );
        expect(
          q.headers.keys.map((k) => k.toLowerCase()),
          isNot(contains('x-client')),
        );
        expect(body, contains('name="timestamp"'));
        expect(body, contains('name="file"'));
      }
      final (req, body) = fake.sent.last;
      expect(req.method, 'POST');
      expect(jsonDecode(body), {
        'judul': 'J',
        'fileUpload': {'public_id': 'p', 'version': 7, 'signature': 'bukti'},
        'coverUpload': {'public_id': 'p', 'version': 7, 'signature': 'bukti'},
      });
      expect(prog.last, 1);
      for (var i = 1; i < prog.length; i++) {
        expect(prog[i], greaterThanOrEqualTo(prog[i - 1]));
      }
    });

    test('tanpa Cloudinary: ikut di body API; ubah memakai PATCH', () async {
      final a = api(
        (r, b) => r.url.path.endsWith('/sign')
            ? js({'direct': false})
            : js({'book': <String, Object>{}}),
      );
      await saveBook(a, id: 'b9', fields: {'judul': 'J'}, pdf: pdf);
      final (req, body) = fake.sent.last;
      expect(req.method, 'PATCH');
      expect(req.url.path, '/api/books/b9');
      expect(body, contains('name="file"; filename="a.pdf"'));
      expect(body.toLowerCase(), contains('content-type: application/pdf'));
    });

    test('ditolak saat tanda tangan: tidak ada yang diunggah', () async {
      final a = api(
        (r, b) => js({'message': 'Ukuran PDF maksimal 10 MB.'}, 400),
      );
      await expectLater(
        saveBook(a, fields: {}, pdf: pdf),
        throwsA(isA<ApiException>()),
      );
      expect(fake.sent.length, 1);
    });

    test('galat Cloudinary: pesannya tampil, buku tidak disimpan', () async {
      final a = api(
        (r, b) => r.url.path.endsWith('/sign')
            ? js({
                'direct': true,
                'url': 'https://api.cloudinary.com/x',
                'fields': <String, Object>{},
              })
            : js({
                'error': {'message': 'File size too large'},
              }, 400),
      );
      await expectLater(
        saveBook(a, fields: {}, pdf: pdf),
        throwsA(
          isA<ApiException>().having(
            (e) => e.message,
            'm',
            'File size too large',
          ),
        ),
      );
      expect(fake.sent.any((s) => s.$1.url.path == '/api/books'), isFalse);
    });
  });
}
