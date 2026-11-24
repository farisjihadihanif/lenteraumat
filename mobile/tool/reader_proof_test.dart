// Uji langsung (butuh internet): PDFium membuka buku sungguhan lewat BookSource.
//   flutter test tool/reader_proof_test.dart --dart-define=API_URL=https://lenteraumat-api.vercel.app
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:lenteraumat/config.dart';
import 'package:lenteraumat/reader/book_source.dart';
import 'package:lenteraumat/reader/chunk_cache.dart';
import 'package:pdfrx/pdfrx.dart';

void main() {
  test('buku dari API terbuka, halaman dirender, lalu luring', () async {
    final dir = await Directory.systemTemp.createTemp('lu-proof');
    await pdfrxInitialize();
    Future<Map> get(String p) async =>
        jsonDecode((await http.get(Uri.parse('$apiBase/api$p'))).body) as Map;
    final items = (await get('/books?limit=48&sort=populer'))['items'] as List;
    final books = [
      for (final b in items.take(24))
        (await get('/books/${b['_id']}'))['book'] as Map,
    ];
    final arsip = books.where((b) => b['file']['direct'] == '').toList()
      ..sort((a, b) => (a['file']['size'] as int) - (b['file']['size'] as int));
    final langsung = books.where((b) => b['file']['direct'] != '').toList();
    for (final b in [
      arsip.first,
      arsip[arsip.length ~/ 2],
      ...langsung.take(1),
    ]) {
      final jam = Stopwatch()..start();
      BookSource make(http.Client? c) => BookSource(
        id: b['_id'] as String,
        proxy: Uri.parse('$apiBase/api/books/${b['_id']}/file'),
        direct: b['file']['direct'] as String,
        cache: ChunkCache(dir: Directory('${dir.path}/c')),
        client: c,
      );
      Future<void> render(BookSource s, int n, String label) async {
        final doc = await PdfDocument.openCustom(
          read: s.read,
          fileSize: s.total,
          sourceName: '$label-${b['_id']}',
          maxSizeToCacheOnMemory: 0,
          useProgressiveLoading: true,
        );
        final page = doc.pages[(n - 1).clamp(0, doc.pages.length - 1)];
        final img = await page.render(fullWidth: 400, fullHeight: 600);
        expect(img, isNotNull);
        expect(img!.pixels.any((p) => p != 255), isTrue);
        img.dispose();
        stdout.writeln(
          '$label: ${doc.pages.length} hal, ${(s.total / 1048576).toStringAsFixed(1)} MB, '
          '${(s.progress! * 100).round()}% terunduh, ${jam.elapsed.inSeconds} dtk, direct=${s.direct.isNotEmpty}',
        );
        await doc.dispose();
      }

      final s = make(null);
      await s.open(sizeHint: b['file']['size'] as int);
      stdout.writeln('potongan 1: ${jam.elapsed.inSeconds} dtk');
      await render(s, 1, 'dingin');
      await s.prefetch();
      stdout.writeln('prefetch: ${s.complete}, ${jam.elapsed.inSeconds} dtk');
      expect(s.complete, isTrue);
      s.close();
      final luring = make(_Offline());
      await luring.open(sizeHint: s.total);
      await render(luring, 5, 'luring');
      luring.close();
    }
  }, timeout: const Timeout(Duration(minutes: 9)));
}

class _Offline extends http.BaseClient {
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) =>
      throw http.ClientException('luring');
}
