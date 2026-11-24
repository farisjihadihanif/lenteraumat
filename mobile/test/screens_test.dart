import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lenteraumat/api.dart';
import 'package:lenteraumat/format.dart';
import 'package:lenteraumat/main.dart';
import 'package:lenteraumat/nav.dart';
import 'package:lenteraumat/reader/progress.dart';
import 'package:lenteraumat/state.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

const faris = {'_id': 'u1', 'username': 'faris', 'namaLengkap': 'Faris'};

Json buku(int i) => {
  '_id': 'b$i',
  'judul': 'Buku $i',
  'penulis': 'Penulis $i',
  'kategori': 'Sastra',
  'cover': '',
  'ratingCount': 0,
  'ratingAvg': 0,
};

void main() {
  late List<http.Request> sent;
  late AppState state;
  var saved = false;

  http.Response balas(http.Request r) {
    final p = r.url.path.replaceFirst('/api', '');
    final q = r.url.queryParameters;
    Object body;
    if (p == '/books' && q['q'] == 'kosong') {
      body = {'items': <Json>[], 'total': 0, 'page': 1, 'pages': 1};
    } else if (p == '/books') {
      final page = int.parse(q['page'] ?? '1');
      body = {
        'items': [for (var i = 0; i < 24; i++) buku(page * 100 + i)],
        'total': 48,
        'page': page,
        'pages': 2,
      };
    } else if (p == '/books/categories') {
      body = {
        'categories': [
          {'name': 'Sastra', 'count': 3},
          {'name': 'Fikih', 'count': 1},
        ],
      };
    } else if (p == '/discussions') {
      body = {
        'items': [
          {
            '_id': 'd1',
            'judul': 'Diskusi pertama',
            'cuplikan': 'Isi',
            'author': faris,
            'likeCount': 2,
            'balasanCount': 1,
          },
        ],
      };
    } else if (p.endsWith('/reviews')) {
      body = {
        'items': <Json>[],
        'page': 1,
        'pages': 1,
        'count': 0,
        'avg': 0,
        'distribution': [
          for (var s = 5; s > 0; s--) {'star': s, 'count': 0},
        ],
        'mine': null,
      };
    } else if (p.endsWith('/save')) {
      body = {'saved': saved = true};
    } else if (p.endsWith('/progress')) {
      body = {'page': 7};
    } else if (p == '/auth/login') {
      body = {'user': faris, 'token': 't1'};
    } else {
      body = {
        'book': {
          ...buku(100),
          'status': 'disetujui',
          'sumber': 'Internet Archive',
          'sumberUrl': 'https://archive.org/details/x',
          'lisensi': 'Domain publik (terbit 1858)',
          'file': {'size': 6275913, 'direct': ''},
          'uploadedBy': {'_id': 'u9', 'username': 'admin'},
          'saved': saved,
          'savedCount': 0,
        },
      };
    }
    return http.Response(
      jsonEncode(body),
      200,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );
  }

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    sent = [];
    saved = false;
    tab.value = tabHome;
    state = AppState(
      ApiClient(
        baseUrl: 'https://api.test',
        secrets: MemorySecretStore(),
        client: MockClient((r) async {
          sent.add(r);
          return balas(r);
        }),
      ),
    );
  });

  Future<void> buka(WidgetTester t, {double scale = 1}) async {
    t.view.physicalSize = const Size(1080, 2340);
    t.view.devicePixelRatio = 3;
    t.platformDispatcher.textScaleFactorTestValue = scale;
    addTearDown(t.view.reset);
    addTearDown(t.platformDispatcher.clearAllTestValues);
    await t.pumpWidget(LenteraApp(state: state));
    await t.pumpAndSettle();
  }

  testWidgets('beranda: Discussion, LUMA, Library', (t) async {
    await buka(t);
    expect(find.text('Discussion'), findsOneWidget);
    expect(find.text('Diskusi pertama'), findsOneWidget);
    final list = find.byType(Scrollable).first;
    await t.scrollUntilVisible(
      find.text('Learning Together with LUMA'),
      300,
      scrollable: list,
    );
    await t.scrollUntilVisible(find.text('More books'), 300, scrollable: list);
    await t.ensureVisible(find.text('More books'));
    await t.pumpAndSettle();
    await t.tap(find.text('More books'));
    await t.pumpAndSettle();
    expect(tab.value, tabLibrary);
  });

  testWidgets('tata letak aman dengan huruf besar', (t) async {
    await buka(t, scale: 1.8);
    tab.value = tabLibrary;
    await t.pumpAndSettle();
    await t.tap(find.text('Buku 100').first);
    await t.pumpAndSettle();
    await t.drag(find.byType(ListView).last, const Offset(0, -1500));
    await t.pumpAndSettle();
    expect(t.takeException(), isNull);
  });

  testWidgets('library: cari (ditunda), kategori, gulir tanpa akhir', (
    t,
  ) async {
    await buka(t);
    tab.value = tabLibrary;
    await t.pumpAndSettle();
    expect(find.text('48 buku'), findsOneWidget);
    await t.drag(find.byType(CustomScrollView), const Offset(0, -3500));
    await t.pumpAndSettle();
    expect(sent.any((r) => r.url.queryParameters['page'] == '2'), isTrue);
    final gulir = find.byType(CustomScrollView);
    t.widget<CustomScrollView>(gulir).controller!.jumpTo(0);
    await t.pumpAndSettle();

    await t.tap(find.widgetWithText(ChoiceChip, 'Sastra'));
    await t.pumpAndSettle();
    expect(sent.last.url.queryParameters['kategori'], 'Sastra');
    expect(sent.last.url.queryParameters['page'], '1');

    final n = sent.length;
    await t.enterText(find.byType(TextField), 'kos');
    await t.pump(const Duration(milliseconds: 100));
    await t.enterText(find.byType(TextField), 'kosong');
    await t.pumpAndSettle(const Duration(milliseconds: 500));
    expect(sent.length, n + 1);
    expect(sent.last.url.queryParameters['q'], 'kosong');
    expect(find.text('No books found'), findsOneWidget);
  });

  testWidgets('detail: sumber & lisensi; Save meminta masuk lalu jalan', (
    t,
  ) async {
    await buka(t);
    tab.value = tabLibrary;
    await t.pumpAndSettle();
    await t.tap(find.text('Buku 100').first);
    await t.pumpAndSettle();
    await t.tap(find.text('Save'));
    await t.pumpAndSettle();
    expect(find.text('Sign in to LenteraUmat'), findsOneWidget);
    await t.enterText(find.byType(TextField).at(0), 'faris');
    await t.enterText(find.byType(TextField).at(1), 'rahasia123');
    await t.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await t.pumpAndSettle();
    final save = sent.lastWhere((r) => r.url.path.endsWith('/save'));
    expect(save.headers['Authorization'], 'Bearer t1');
    expect(find.text('Saved'), findsOneWidget);
    await t.pump(const Duration(seconds: 5));
    await t.scrollUntilVisible(
      find.text('Domain publik (terbit 1858)'),
      200,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text('Source & license'), findsOneWidget);
    expect(find.text('Internet Archive'), findsOneWidget);
  });

  group('halaman terakhir', () {
    test('tamu: di perangkat saja', () async {
      await ReadingProgress(state, 'b1').save(12);
      expect(await ReadingProgress(state, 'b1').load(), 12);
      expect(sent, isEmpty);
    });

    test('masuk: dari server; akun lain tidak memakai punya tamu', () async {
      await ReadingProgress(state, 'b1').save(12);
      await state.login('faris', 'rahasia123');
      expect(await ReadingProgress(state, 'b1').load(), 7);
      await ReadingProgress(state, 'b1').save(9);
      expect(jsonDecode(sent.last.body), {'page': 9});
    });

    test('luring: yang belum terkirim didahulukan dan dikirim ulang', () async {
      var putus = false;
      final s = AppState(
        ApiClient(
          baseUrl: 'https://api.test',
          secrets: MemorySecretStore(),
          client: MockClient((r) async {
            if (putus) throw http.ClientException('putus');
            sent.add(r);
            return balas(r);
          }),
        ),
      );
      await s.login('faris', 'rahasia123');
      putus = true;
      await ReadingProgress(s, 'b1').save(40);
      expect(await ReadingProgress(s, 'b1').load(), 40);
      putus = false;
      expect(await ReadingProgress(s, 'b1').load(), 40);
      expect(sent.last.method, 'PUT');
      expect(jsonDecode(sent.last.body), {'page': 40});
      expect(await ReadingProgress(s, 'b1').load(), 7); // sudah sinkron
    });
  });

  test('format', () {
    final now = DateTime.utc(2026, 11, 24, 12);
    expect(timeAgo('2026-11-24T11:59:30Z', now: now), 'baru saja');
    expect(timeAgo('2026-11-24T10:00:00Z', now: now), '2 jam lalu');
    expect(formatSize(6275913), '6.0 MB');
    expect(displayName({'namaLengkap': '', 'username': 'x'}), 'x');
    expect(displayName(null), 'Pengguna');
  });
}
