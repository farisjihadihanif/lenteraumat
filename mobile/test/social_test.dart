import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:lenteraumat/api.dart';
import 'package:lenteraumat/main.dart';
import 'package:lenteraumat/nav.dart';
import 'package:lenteraumat/screens/discussion_detail.dart';
import 'package:lenteraumat/state.dart';
import 'package:lenteraumat/widgets/quiz.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

const faris = {'_id': 'u1', 'username': 'faris', 'namaLengkap': 'Faris'};
const lain = {'_id': 'u2', 'username': 'lain', 'namaLengkap': 'Lain'};

const kuis = {
  'untuk': 'latihan',
  'type': 'isian',
  'level': 'sedang',
  'judul': 'Wudu',
  'questions': [
    {
      'type': 'isian',
      'question': 'Rukun wudu ada ____',
      'options': <String>[],
      'answer': 'Enam (6)',
      'explanation': 'Lihat hal. 3',
    },
  ],
};

class Fake extends http.BaseClient {
  final sent = <(String, String, String)>[];
  StreamController<List<int>>? live;
  bool likeFails = false;

  http.StreamedResponse _js(Object o, [int s = 200]) => http.StreamedResponse(
    Stream.value(utf8.encode(jsonEncode(o))),
    s,
    headers: {'content-type': 'application/json'},
  );

  @override
  Future<http.StreamedResponse> send(http.BaseRequest r) async {
    final body = utf8.decode(
      await r.finalize().toBytes(),
      allowMalformed: true,
    );
    final p = r.url.path.replaceFirst('/api', '');
    sent.add((r.method, p, body));
    if (p == '/ai/chat') {
      live = StreamController();
      return http.StreamedResponse(
        live!.stream,
        200,
        headers: {'content-type': 'text/event-stream'},
      );
    }
    if (p == '/ai/quiz') return _js({'sessionId': 's2', 'quiz': kuis});
    if (p == '/ai/status') return _js({'enabled': true, 'maxAttachMb': 4});
    if (p == '/ai/usage') return _js({'limit': 40, 'remaining': 39});
    if (p == '/auth/login') return _js({'user': faris, 'token': 't'});
    if (p.endsWith('/like')) {
      return likeFails
          ? _js({'message': 'Gagal suka.'}, 500)
          : _js({'active': true, 'count': 3});
    }
    if (p.endsWith('/comments')) {
      return _js({
        'comment': {
          '_id': 'c9',
          'isi': (jsonDecode(body) as Json)['isi'],
          'author': faris,
          'parent': (jsonDecode(body) as Json)['parent'],
        },
      }, 201);
    }
    if (p == '/discussions/d1') {
      return _js({
        'discussion': {
          '_id': 'd1',
          'judul': 'Judul diskusi',
          'isi': 'Isi **tebal**',
          'author': lain,
          'likeCount': 2,
          'balasanCount': 2,
        },
        'comments': [
          {'_id': 'c1', 'isi': 'Komentar satu', 'author': lain},
          {'_id': 'c2', 'isi': 'Balasan', 'author': lain, 'parent': 'c1'},
        ],
      });
    }
    if (p == '/discussions') {
      return _js({
        'items': [
          {
            '_id': 'd1',
            'judul': 'Judul diskusi',
            'cuplikan': 'Cuplikan',
            'author': lain,
            'likeCount': 2,
            'balasanCount': 2,
          },
        ],
        'page': 1,
        'pages': 1,
      });
    }
    return _js({'items': <Json>[], 'total': 0, 'page': 1, 'pages': 1});
  }
}

void main() {
  late Fake fake;
  late AppState state;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    fake = Fake();
    lumaRequest.value = null;
    state = AppState(
      ApiClient(
        baseUrl: 'https://api.test',
        secrets: MemorySecretStore(),
        client: fake,
      ),
    );
  });

  Future<void> buka(
    WidgetTester t,
    int index, {
    bool masuk = true,
    double scale = 1,
  }) async {
    t.view.physicalSize = const Size(1080, 2340);
    t.view.devicePixelRatio = 3;
    t.platformDispatcher.textScaleFactorTestValue = scale;
    addTearDown(t.view.reset);
    addTearDown(t.platformDispatcher.clearAllTestValues);
    if (masuk) await state.login('faris', 'rahasia123');
    tab.value = index;
    await t.pumpWidget(LenteraApp(state: state));
    await t.pumpAndSettle();
  }

  testWidgets('suka: langsung tampil, batal saat gagal', (t) async {
    await buka(t, tabDiscussions);
    await t.tap(find.bySemanticsLabel('Like, 2'));
    await t.pumpAndSettle();
    expect(find.bySemanticsLabel('Like, 3'), findsOneWidget);
    fake.likeFails = true;
    await t.tap(find.bySemanticsLabel('Like, 3'));
    await t.pumpAndSettle();
    expect(find.bySemanticsLabel('Like, 3'), findsOneWidget);
    expect(find.text('Gagal suka.'), findsOneWidget);
  });

  testWidgets('tamu menyukai: diminta masuk', (t) async {
    await buka(t, tabDiscussions, masuk: false);
    await t.tap(find.bySemanticsLabel('Like, 2'));
    await t.pumpAndSettle();
    expect(find.text('Sign in to LenteraUmat'), findsOneWidget);
    expect(fake.sent.any((s) => s.$2.endsWith('/like')), isFalse);
  });

  testWidgets('detail: balas komentar mengirim parent', (t) async {
    await buka(t, tabDiscussions);
    await t.tap(find.text('Judul diskusi'));
    await t.pumpAndSettle();
    expect(find.text('2 comments'), findsOneWidget);
    await t.tap(find.text('Reply').first);
    await t.pumpAndSettle();
    expect(find.text('Balas @lain'), findsOneWidget);
    await t.enterText(find.byType(TextField).last, 'Halo');
    await t.tap(find.byTooltip('Post comment'));
    await t.pumpAndSettle();
    final c = fake.sent.lastWhere((s) => s.$2.endsWith('/comments'));
    expect(jsonDecode(c.$3), {'isi': 'Halo', 'parent': 'c1'});
    expect(find.text('3 comments'), findsOneWidget);
  });

  testWidgets('LUMA: jawaban mengalir, lalu selesai', (t) async {
    await buka(t, tabLuma);
    await t.enterText(find.byType(TextField), 'Apa itu sabar?');
    await t.tap(find.byTooltip('Send'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 50));
    expect(find.text('LUMA sedang menulis…'), findsOneWidget);
    void ev(Object o) =>
        fake.live!.add(utf8.encode('data: ${jsonEncode(o)}\n\n'));
    ev({'text': 'Sabar '});
    await t.pump(const Duration(milliseconds: 100));
    await t.pump(const Duration(milliseconds: 100));
    expect(find.textContaining('Sabar', findRichText: true), findsWidgets);
    ev({
      'done': {'reply': 'Sabar adalah menahan diri.', 'sessionId': 's1'},
    });
    await fake.live!.close();
    await t.pumpAndSettle();
    expect(
      find.textContaining('menahan diri', findRichText: true),
      findsWidgets,
    );
    expect(find.text('Copy'), findsOneWidget);
  });

  testWidgets('LUMA: percakapan baru membuang jawaban lama', (t) async {
    await buka(t, tabLuma);
    await t.enterText(find.byType(TextField), 'Pertanyaan lama');
    await t.tap(find.byTooltip('Send'));
    await t.pump(const Duration(milliseconds: 50));
    await t.tap(find.byTooltip('New chat'));
    await t.pump();
    fake.live!.add(
      utf8.encode(
        'data: ${jsonEncode({
          'done': {'reply': 'Jawaban lama', 'sessionId': 's1'},
        })}\n\n',
      ),
    );
    await fake.live!.close();
    await t.pumpAndSettle();
    expect(find.textContaining('Jawaban lama', findRichText: true), findsNothing);
  });

  testWidgets('kuis dari topik, dinilai otomatis (huruf besar juga aman)', (
    t,
  ) async {
    await buka(t, tabLuma, scale: 1.4);
    await t.tap(find.widgetWithText(ChoiceChip, 'Quiz').hitTestable());
    await t.pumpAndSettle();
    await t.tap(find.text('From a topic'));
    await t.pumpAndSettle();
    await t.enterText(find.byType(TextField).first, 'Wudu');
    await t.pumpAndSettle();
    await t.ensureVisible(find.text('Create quiz'));
    await t.pumpAndSettle();
    await t.tap(find.text('Create quiz'));
    await t.pumpAndSettle();
    final q = fake.sent.lastWhere((s) => s.$2 == '/ai/quiz');
    expect((jsonDecode(q.$3) as Json)['topik'], 'Wudu');
    final jawab = find.widgetWithText(TextField, 'Jawabanmu');
    await t.ensureVisible(jawab);
    await t.pumpAndSettle();
    await t.enterText(jawab, '  enam 6 ');
    await t.pumpAndSettle();
    await t.ensureVisible(find.text('Check answers'));
    await t.pumpAndSettle();
    await t.tap(find.text('Check answers'));
    await t.pumpAndSettle();
    expect(find.text('Skor 1/1'), findsOneWidget);
    expect(t.takeException(), isNull);
  });

  test('utas: balasan yatim jadi komentar biasa', () {
    final r = threads([
      {'_id': 'a'},
      {'_id': 'b', 'parent': 'a'},
      {'_id': 'c', 'parent': 'hilang'},
    ]);
    expect(r.map((e) => e.$1['_id']), ['a', 'c']);
    expect(r.first.$2.single['_id'], 'b');
  });

  test('lembar soal: kunci hanya bila diminta', () {
    expect(sheetText(kuis), isNot(contains('Enam')));
    expect(sheetText(kuis, withKey: true), contains('1. Enam (6)'));
    expect(isCorrect({'type': 'isian', 'answer': '…'}, '!'), isFalse);
  });
}
