import 'package:shared_preferences/shared_preferences.dart';

import '../state.dart';

/// Halaman terakhir: selalu disimpan di perangkat (per akun), dan di server bila masuk.
class ReadingProgress {
  ReadingProgress(this.state, this.bookId)
    : _uid = '${state.user?['_id'] ?? 'tamu'}';

  final AppState state;
  final String bookId;
  final String _uid;

  String get _key => 'baca:$_uid:$bookId';

  /// Ditandai bila halaman di perangkat belum sampai ke server.
  String get _dirty => '$_key:belum';

  bool get _online => state.signedIn && '${state.user?['_id']}' == _uid;

  Future<int> load() async {
    SharedPreferences? p;
    try {
      p = await SharedPreferences.getInstance();
    } catch (_) {}
    final local = p?.getInt(_key) ?? 1;
    if (!_online) return local;
    if (p?.getBool(_dirty) ?? false) {
      await _push(p, local);
      return local;
    }
    try {
      final r = await state.api
          .get('/books/$bookId/progress')
          .timeout(const Duration(seconds: 6));
      return (r['page'] as num?)?.toInt() ?? local;
    } catch (_) {
      return local;
    }
  }

  Future<void> save(int page) async {
    SharedPreferences? p;
    try {
      p = await SharedPreferences.getInstance();
      await p.setInt(_key, page);
      if (_online) await p.setBool(_dirty, true);
    } catch (_) {}
    if (_online) await _push(p, page);
  }

  Future<void> _push(SharedPreferences? p, int page) async {
    try {
      await state.api.put('/books/$bookId/progress', {'page': page});
      // Halaman bisa sudah berganti selagi mengirim.
      if (p?.getInt(_key) == page) await p?.remove(_dirty);
    } catch (_) {
      // Dikirim lagi saat buku dibuka berikutnya.
    }
  }
}
