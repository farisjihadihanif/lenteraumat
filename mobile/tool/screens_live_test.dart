// ignore_for_file: invalid_use_of_visible_for_testing_member
// Uji langsung (butuh internet): layar sungguhan dengan data API, hasil PNG di SHOT_DIR.
//   flutter test tool/screens_live_test.dart --dart-define=API_URL=https://lenteraumat-api.vercel.app --dart-define=SHOT_DIR=...
import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:lenteraumat/api.dart';
import 'package:lenteraumat/main.dart';
import 'package:lenteraumat/nav.dart';
import 'package:lenteraumat/reader/chunk_cache.dart';
import 'package:lenteraumat/screens/book_detail.dart';
import 'package:lenteraumat/screens/reader.dart';
import 'package:lenteraumat/state.dart';
import 'package:material_ui/material_ui.dart';
import 'package:pdfrx/pdfrx.dart';
import 'package:shared_preferences/shared_preferences.dart';

const shots = String.fromEnvironment('SHOT_DIR');

/// Data produksi tidak boleh berubah (mis. hitungan "dibaca").
class _ReadOnly extends http.BaseClient {
  final _inner = http.Client();
  @override
  Future<http.StreamedResponse> send(http.BaseRequest r) => r.method == 'GET'
      ? _inner.send(r)
      : throw http.ClientException('hanya baca');
}

void main() {
  LiveTestWidgetsFlutterBinding.ensureInitialized().framePolicy =
      LiveTestWidgetsFlutterBindingFramePolicy.fullyLive;

  testWidgets('layar langsung', (t) async {
    HttpOverrides.global = null;
    SharedPreferences.setMockInitialValues({});
    for (final (fam, ws) in [
      ('Manrope', [400, 500, 600, 700, 800]),
      ('Literata', [400, 600, 700]),
    ]) {
      final l = FontLoader(fam);
      for (final w in ws) {
        l.addFont(rootBundle.load('assets/fonts/$fam-$w.ttf'));
      }
      await l.load();
    }
    final icons = FontLoader('MaterialIcons')
      ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
    await icons.load();
    await pdfrxInitialize();

    final dir = await Directory.systemTemp.createTemp('lu-live');
    final api = ApiClient(secrets: MemorySecretStore(), client: _ReadOnly());
    final state = AppState(api, cache: ChunkCache(dir: dir));
    final key = GlobalKey();
    await t.binding.setSurfaceSize(const Size(400, 860));
    await t.pumpWidget(
      RepaintBoundary(
        key: key,
        child: LenteraApp(state: state),
      ),
    );
    Future<void> wait(int s) => t.pump(Duration(seconds: s));
    Future<void> shot(String name) async {
      if (shots.isEmpty) return;
      final b =
          key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
      final img = await b.toImage(pixelRatio: 1.5);
      final png = await img.toByteData(format: ui.ImageByteFormat.png);
      File('$shots/$name.png').writeAsBytesSync(png!.buffer.asUint8List());
    }

    await wait(7);
    await shot('home1');
    await t.drag(find.byType(ListView).first, const Offset(0, -1250));
    await wait(2);
    await shot('home2');
    await state.setTheme(ThemeMode.dark);
    tab.value = tabLibrary;
    await wait(8);
    await shot('library-dark');
    tab.value = 4;
    await wait(1);
    await shot('profile-dark');
    await state.setTheme(ThemeMode.light);

    final list = await api.get(
      '/books',
      query: {'limit': 48, 'sort': 'populer'},
    );
    Json? pick;
    for (final b in list['items'] as List) {
      final d = (await api.get('/books/${(b as Json)['_id']}'))['book'] as Json;
      final f = d['file'] as Json;
      final size = f['size'] as int;
      if (f['direct'] == '' && size > 5 << 20 && size < 15 << 20) {
        pick = d;
        break;
      }
    }
    final nav = t.state<NavigatorState>(find.byType(Navigator).first);
    unawaited(
      nav.push(
        MaterialPageRoute<void>(
          builder: (_) => BookDetailScreen(id: '${pick!['_id']}'),
        ),
      ),
    );
    await wait(6);
    await shot('detail');

    Future<Stopwatch> baca(String label, {bool shotLoading = false}) async {
      final jam = Stopwatch()..start();
      unawaited(
        nav.push(
          MaterialPageRoute<void>(builder: (_) => ReaderScreen(book: pick!)),
        ),
      );
      await wait(3);
      if (shotLoading) await shot('reader-loading');
      while (find.byType(ReaderLoading).evaluate().isNotEmpty) {
        if (jam.elapsed.inSeconds > 150) fail('halaman pertama tidak tampil');
        await t.pump(const Duration(milliseconds: 200));
      }
      stdout.writeln(
        '$label: tampil ${jam.elapsed.inSeconds} dtk, cache '
        '${(state.cache!.totalBytes / 1048576).toStringAsFixed(1)} dari '
        '${((pick!['file'] as Json)['size'] as int) / 1048576} MB',
      );
      return jam;
    }

    var jam = await baca('dingin', shotLoading: true);
    await wait(3);
    await shot('reader-first');
    await t.tap(find.byTooltip('Next page'));
    await wait(4);
    await t.tap(find.byTooltip('Next page'));
    await wait(6);
    await shot('reader-page3');
    final total = (pick!['file'] as Json)['size'] as int;
    while (state.cache!.totalBytes < total && jam.elapsed.inSeconds < 260) {
      await wait(2);
    }
    stdout.writeln(
      'prefetch selesai: ${state.cache!.totalBytes == total}, ${jam.elapsed.inSeconds} dtk',
    );
    expect(state.cache!.totalBytes, total);
    nav.pop();
    await wait(2);
    jam = await baca('hangat');
    await wait(2);
    await shot('reader-resume');
    expect(find.text('3 / ${pick['halaman']}'), findsOneWidget);
    nav.pop();
    await wait(2);
  }, timeout: const Timeout(Duration(minutes: 9)));
}
