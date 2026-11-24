import 'dart:async';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lenteraumat/reader/book_source.dart';
import 'package:lenteraumat/reader/chunk_cache.dart';

final isi = Uint8List.fromList(
  List.generate(kChunk * 3 + 1234, (i) => (i * 31 + i ~/ 977) & 255),
);
final proxy = Uri.parse('https://api.test/api/books/b1/file');
const direct = 'https://res.cloudinary.com/x/raw/upload/v1/buku.pdf';

http.Response potong(http.Request r, [Uint8List? data]) {
  final src = data ?? isi;
  final m = RegExp(r'bytes=(\d+)-(\d+)').firstMatch(r.headers['Range']!)!;
  final a = int.parse(m[1]!);
  final b = math.min(int.parse(m[2]!), src.length - 1);
  return http.Response.bytes(
    Uint8List.sublistView(src, a, b + 1),
    206,
    headers: {'content-range': 'bytes $a-$b/${src.length}'},
  );
}

void main() {
  late Directory dir;
  late List<http.Request> sent;

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('lu-cache');
    sent = [];
  });
  tearDown(() async {
    try {
      await dir.delete(recursive: true);
    } catch (_) {}
  });

  BookSource make(
    FutureOr<http.Response> Function(http.Request r) balas, {
    String direct = '',
    ChunkCache? cache,
  }) => BookSource(
    id: 'b1',
    proxy: proxy,
    direct: direct,
    headers: () => {'Authorization': 'Bearer rahasia'},
    cache: cache,
    retryBase: const Duration(milliseconds: 1),
    client: MockClient((r) async {
      sent.add(r);
      return balas(r);
    }),
  );

  Future<Uint8List> baca(BookSource s, int pos, int size) async {
    final buf = Uint8List(size);
    expect(await s.read(buf, pos, size), size);
    return buf;
  }

  test('bacaan lintas potongan terisi penuh dan benar', () async {
    final s = make(potong);
    await s.open();
    expect(s.total, isi.length);
    final at = kChunk - 100;
    expect(await baca(s, at, kChunk + 300), isi.sublist(at, at + kChunk + 300));
    expect(await baca(s, isi.length - 10, 10), isi.sublist(isi.length - 10));
    expect(sent.first.url.queryParameters['r'], '0-${kChunk - 1}');
    expect(sent.first.headers['Authorization'], 'Bearer rahasia');
    s.close();
  });

  test('bacaan bersamaan berbagi satu unduhan', () async {
    final s = make(potong);
    await s.open();
    await Future.wait([for (var i = 0; i < 5; i++) baca(s, kChunk + i, 50)]);
    expect(sent.length, 2);
    s.close();
  });

  test('alamat langsung didahulukan, tanpa token', () async {
    final s = make(potong, direct: direct);
    await s.open();
    await baca(s, kChunk, 10);
    expect(sent.every((r) => r.url.toString() == direct), isTrue);
    expect(sent.every((r) => !r.headers.containsKey('Authorization')), isTrue);
    s.close();
  });

  test('alamat langsung gagal: pindah ke proxy', () async {
    final s = make(
      (r) => r.url.host == 'api.test' ? potong(r) : http.Response('x', 401),
      direct: direct,
    );
    await s.open();
    await baca(s, kChunk, 10);
    expect(sent.map((r) => r.url.host), [
      'res.cloudinary.com',
      'api.test',
      'api.test',
    ]);
    s.close();
  });

  test('gangguan setelah terbuka diulang sampai pulih', () async {
    var gagal = 6;
    final s = make(
      (r) => r.headers['Range']!.startsWith('bytes=0-') || gagal-- <= 0
          ? potong(r)
          : http.Response('{}', 502),
    );
    await s.open();
    expect(await baca(s, kChunk, 10), isi.sublist(kChunk, kChunk + 10));
    expect(s.retrying, isFalse);
    s.close();
  });

  test('gagal membuka: berhenti setelah beberapa kali', () async {
    final s = make((r) => http.Response('{}', 502));
    await expectLater(s.open(), throwsA(isA<BookSourceException>()));
    expect(sent.length, 4);
    s.close();
  });

  test('404 tidak diulang', () async {
    final s = make((r) => http.Response('{}', 404));
    await expectLater(s.open(), throwsA(isA<BookSourceException>()));
    expect(sent.length, 1);
    s.close();
  });

  test('potongan terpotong tidak diterima', () async {
    var n = 0;
    final s = make((r) {
      final ok = potong(r);
      return n++ == 0
          ? http.Response.bytes(
              ok.bodyBytes.sublist(0, 100),
              206,
              headers: ok.headers,
            )
          : ok;
    });
    await s.open();
    expect(await baca(s, 0, 200), isi.sublist(0, 200));
    s.close();
  });

  test('server yang membalas file utuh tetap terbaca', () async {
    final s = make((r) => http.Response.bytes(isi, 200));
    await s.open();
    expect(
      await baca(s, kChunk * 2, 99),
      isi.sublist(kChunk * 2, kChunk * 2 + 99),
    );
    expect(sent.length, 1);
    s.close();
  });

  test('prefetch melengkapi; dibuka lagi tanpa jaringan', () async {
    final cache = ChunkCache(dir: dir);
    final s = make(potong, cache: cache);
    await s.open();
    expect(s.progress, lessThan(.5));
    await s.prefetch(from: 1);
    expect(s.complete, isTrue);
    expect(s.progress, 1);
    expect(sent.length, 4);
    // Dari posisi baca: potongan terakhir dulu.
    expect(sent[1].headers['Range'], startsWith('bytes=${kChunk * 3}-'));
    s.close();

    sent.clear();
    final lagi = make(
      (r) => throw http.ClientException('luring'),
      cache: ChunkCache(dir: dir),
    );
    await lagi.open(sizeHint: isi.length);
    expect(await baca(lagi, 0, isi.length), isi);
    expect(lagi.complete, isTrue);
    expect(sent, isEmpty);
    lagi.close();
  });

  test(
    'tutup: bacaan yang menunggu langsung gagal, tidak menulis buffer',
    () async {
      final tahan = Completer<void>();
      final s = make((r) async {
        if (!r.headers['Range']!.startsWith('bytes=0-')) await tahan.future;
        return potong(r);
      });
      await s.open();
      final buf = Uint8List(10);
      final f = s.read(buf, kChunk + 1, 10);
      final gagal = expectLater(f, throwsA(anything));
      s.close();
      tahan.complete();
      await gagal;
      expect(buf, everyElement(0));
    },
  );

  group('ChunkCache', () {
    Uint8List blok(int n) => Uint8List(100)..fillRange(0, 100, n);

    test('LRU: yang lama tidak dipakai dibuang, total dalam batas', () async {
      final c = ChunkCache(dir: dir, maxBytes: 300);
      for (var i = 0; i < 3; i++) {
        await c.write('a', i, blok(i));
      }
      expect(await c.read('a', 0, 100), blok(0)); // baru dipakai
      await c.write('b', 0, blok(9));
      expect(await c.has('a', 0), isTrue);
      expect(await c.has('a', 1), isFalse);
      expect(c.totalBytes, 300);
      expect(dir.listSync().length, 3);
    });

    test('dibuka lagi: isi terbaca, sisa .tmp dibuang', () async {
      await ChunkCache(dir: dir).write('a', 0, blok(1));
      File('${dir.path}/a.1.bin.7.tmp').writeAsBytesSync([1]);
      final c = ChunkCache(dir: dir);
      expect(await c.read('a', 0, 100), blok(1));
      expect(dir.listSync().length, 1);
    });

    test('ukuran tidak cocok dianggap rusak', () async {
      final c = ChunkCache(dir: dir);
      await c.write('a', 0, blok(1));
      expect(await c.read('a', 0, 101), isNull);
      expect(await c.has('a', 0), isFalse);
      expect(c.totalBytes, 0);
    });
  });
}
