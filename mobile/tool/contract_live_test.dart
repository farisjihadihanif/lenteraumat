// Kontrak tulis terhadap API lokal sekali pakai (bukan produksi):
//   node tool/api_sementara.js   lalu   flutter test tool/contract_live_test.dart --dart-define=API_URL=http://localhost:4555
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:lenteraumat/api.dart';
import 'package:lenteraumat/config.dart';
import 'package:lenteraumat/reader/book_source.dart';
import 'package:lenteraumat/state.dart';
import 'package:lenteraumat/widgets/pick.dart';

String pdf() {
  final objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] >>',
  ];
  var out = '%PDF-1.4\n';
  final offsets = <int>[];
  for (final (i, o) in objs.indexed) {
    offsets.add(out.length);
    out += '${i + 1} 0 obj\n$o\nendobj\n';
  }
  final xref = out.length;
  out += 'xref\n0 4\n0000000000 65535 f \n';
  for (final o in offsets) {
    out += '${'$o'.padLeft(10, '0')} 00000 n \n';
  }
  return '${out}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n$xref\n%%EOF';
}

const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

void main() {
  test('buku, diskusi, komentar, suka, profil, rak', () async {
    expect(Uri.parse(apiBase).host, 'localhost');
    HttpOverrides.global = null;
    final dir = await Directory.systemTemp.createTemp('lu-kontrak');
    final fPdf = File('${dir.path}/buku.pdf')..writeAsStringSync(pdf());
    final fPng = File('${dir.path}/g.png')..writeAsBytesSync(base64Decode(png));
    final store = MemorySecretStore();
    final s = AppState(ApiClient(secrets: store));
    final api = s.api;
    await s.register({
      'namaLengkap': 'Kontrak',
      'username': 'kontrak',
      'email': 'kontrak@lu.id',
      'password': 'rahasia123',
    });

    final prog = <double>[];
    final saved = await saveBook(
      api,
      fields: {
        'judul': 'Buku Kontrak',
        'penulis': 'P',
        'kategori': 'Umum',
        'tahunTerbit': '2020',
      },
      pdf: fileOf(fPdf.path),
      cover: fileOf(fPng.path),
      onProgress: prog.add,
    );
    final book = saved['book'] as Json;
    expect(book['status'], 'menunggu');
    expect(prog.last, 1);
    await saveBook(
      api,
      id: '${book['_id']}',
      fields: {'judul': 'Buku Kontrak 2'},
    );
    final mine = (await api.get('/books/mine'))['items'] as List;
    expect((mine.single as Json)['judul'], 'Buku Kontrak 2');

    // Buku yang belum tayang terbaca pemiliknya lewat token, tidak oleh tamu.
    BookSource src(Map<String, String> Function()? h) => BookSource(
      id: '${book['_id']}',
      proxy: api.uri('/books/${book['_id']}/file'),
      headers: h,
    );
    final ok = src(api.authHeaders);
    await ok.open();
    expect(ok.total, fPdf.lengthSync());
    ok.close();
    final tamu = src(null);
    await expectLater(
      tamu.open(),
      throwsA(
        isA<BookSourceException>().having((e) => e.status, 'status', 404),
      ),
    );
    tamu.close();

    final d =
        (await api.form(
              'POST',
              '/discussions',
              fields: {
                'judul': 'Judul é',
                'isi': 'Isi diskusi cukup panjang',
                'book': '',
              },
              files: [fileOf(fPng.path).as('gambar')],
            ))['discussion']
            as Json;
    expect(d['cover'], isNotEmpty);
    expect(d['judul'], 'Judul é');
    await api.form(
      'PATCH',
      '/discussions/${d['_id']}',
      fields: {
        'judul': 'Judul baru',
        'isi': 'Isi diskusi cukup panjang',
        'book': '',
      },
    );
    expect((await api.post('/discussions/${d['_id']}/like'))['active'], isTrue);
    final c =
        (await api.post('/discussions/${d['_id']}/comments', {
              'isi': 'Halo',
            }))['comment']
            as Json;
    await api.post('/discussions/${d['_id']}/comments', {
      'isi': 'Balas',
      'parent': c['_id'],
    });
    await api.delete('/discussions/${d['_id']}/comments/${c['_id']}');
    final r = await api.get('/discussions/${d['_id']}');
    expect(r['comments'], isEmpty);
    expect((r['discussion'] as Json)['judul'], 'Judul baru');

    // Soal LUMA diposting: kunci tidak bocor ke tamu.
    final k =
        (await api.post('/discussions', {
              'judul': 'Soal',
              'isi': 'Kerjakan soal berikut ini',
              'book': '',
              'kuis': {
                'judul': 'K',
                'type': 'isian',
                'questions': [
                  {'type': 'isian', 'question': 'Q ____', 'answer': 'A'},
                ],
                'kunciPublik': false,
              },
            }))['discussion']
            as Json;
    final guest = ApiClient(secrets: MemorySecretStore());
    final g =
        (await guest.get('/discussions/${k['_id']}'))['discussion'] as Json;
    expect((g['kuis'] as Json).containsKey('kunci'), isFalse);
    await api.patch('/discussions/${k['_id']}', {'kunciPublik': true});

    await s.saveProfile({
      'namaLengkap': 'Nama Baru',
      'bio': 'Bio',
    }, fileOf(fPng.path));
    expect(s.user!['namaLengkap'], 'Nama Baru');
    expect(s.user!['fotoProfil'], isNotEmpty);
    expect((jsonDecode(store.isi['auth_user']!) as Json)['bio'], 'Bio');

    await api.delete('/books/${book['_id']}');
    expect((await api.get('/books/continue'))['items'], isEmpty);
    expect((await api.get('/ai/sessions'))['items'], isEmpty);
    expect((await api.get('/ai/usage'))['remaining'], isNotNull);
    await s.deleteAccount('rahasia123');
    expect(store.isi, isEmpty);
    await dir.delete(recursive: true);
  });
}
