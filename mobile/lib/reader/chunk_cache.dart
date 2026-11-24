import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:path_provider/path_provider.dart';

class _Entry {
  _Entry(this.size, this.used);
  final int size;
  int used;
}

/// Potongan PDF di disk (folder cache aplikasi), dibatasi [maxBytes]; yang paling
/// lama tidak dipakai dibuang dulu. Waktu ubah berkas = waktu terakhir dipakai.
class ChunkCache {
  ChunkCache({Directory? dir, this.maxBytes = 300 * 1024 * 1024})
    : _given = dir;

  final Directory? _given;
  final int maxBytes;
  final Map<String, _Entry> _entries = {};
  int _total = 0;
  int _clock = 0;
  late Directory _dir;
  Future<void>? _opening;

  int get totalBytes => _total;

  Future<void> _open() => _opening ??= _scan();

  Future<void> _scan() async {
    _dir =
        _given ??
        Directory('${(await getApplicationCacheDirectory()).path}/buku');
    await _dir.create(recursive: true);
    final found = <(String, int, DateTime)>[];
    for (final f in await _dir.list().toList()) {
      if (f is! File) continue;
      final name = f.uri.pathSegments.last;
      try {
        if (!name.endsWith('.bin')) {
          await f.delete(); // sisa tulisan yang terputus
          continue;
        }
        final st = await f.stat();
        found.add((name, st.size, st.modified));
      } catch (_) {}
    }
    found.sort((a, b) => a.$3.compareTo(b.$3));
    for (final (name, size, _) in found) {
      _entries[name] = _Entry(size, ++_clock);
      _total += size;
    }
    await _evict();
  }

  static String _name(String book, int index) => '$book.$index.bin';
  File _file(String name) => File('${_dir.path}/$name');

  Future<bool> has(String book, int index) async {
    try {
      await _open();
      return _entries.containsKey(_name(book, index));
    } catch (_) {
      return false;
    }
  }

  Future<Uint8List?> read(String book, int index, int length) async {
    final name = _name(book, index);
    try {
      await _open();
      final e = _entries[name];
      if (e == null) return null;
      e.used = ++_clock;
      final data = await _file(name).readAsBytes();
      if (data.length != length) {
        await _drop(name);
        return null;
      }
      unawaited(_file(name).setLastModified(DateTime.now()).catchError((_) {}));
      return data;
    } catch (_) {
      _forget(name);
      return null;
    }
  }

  /// Gagal menulis (disk penuh) tidak menggagalkan pembaca.
  Future<void> write(String book, int index, Uint8List data) async {
    if (data.length > maxBytes) return;
    final name = _name(book, index);
    try {
      await _open();
      final tmp = File('${_dir.path}/$name.${++_clock}.tmp');
      await tmp.writeAsBytes(data);
      await tmp.rename(_file(name).path);
      _forget(name);
      _entries[name] = _Entry(data.length, ++_clock);
      _total += data.length;
      await _evict();
    } catch (_) {}
  }

  Future<void> _evict() async {
    while (_total > maxBytes && _entries.isNotEmpty) {
      var oldest = _entries.entries.first;
      for (final e in _entries.entries) {
        if (e.value.used < oldest.value.used) oldest = e;
      }
      await _drop(oldest.key);
    }
  }

  void _forget(String name) {
    final e = _entries.remove(name);
    if (e != null) _total -= e.size;
  }

  Future<void> _drop(String name) async {
    _forget(name);
    try {
      await _file(name).delete();
    } catch (_) {}
  }
}
