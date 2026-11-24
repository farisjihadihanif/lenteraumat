import 'dart:async';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import 'chunk_cache.dart';

const kChunk = 512 * 1024;

class BookSourceException implements Exception {
  BookSourceException(this.message, [this.status = 0]);
  final String message;
  final int status;
  @override
  String toString() => message;
}

class _Closed implements Exception {}

class _Pending {
  final done = Completer<Uint8List>();
  int received = 0;
}

/// Isi PDF yang diambil per potongan 512 KB lewat header Range, disimpan di [cache].
///
/// [direct] (Cloudinary) didahulukan dan tidak pernah menerima token; kalau gagal,
/// pindah ke [proxy] (`/api/books/:id/file`). [read] selalu mengisi penuh rentang
/// yang diminta, karena PDFium menganggap bacaan sebagian sebagai galat.
class BookSource extends ChangeNotifier {
  BookSource({
    required this.id,
    required this.proxy,
    this.direct = '',
    this.headers,
    this.cache,
    http.Client? client,
    this.headerTimeout = const Duration(seconds: 115),
    this.idleTimeout = const Duration(seconds: 30),
    this.retryBase = const Duration(milliseconds: 600),
  }) : _client = client ?? http.Client();

  final String id;
  final Uri proxy;
  final String direct;

  /// Header untuk [proxy] saja, dibaca tiap permintaan (token bisa diperbarui).
  final Map<String, String> Function()? headers;

  /// Null = tidak disimpan di disk (buku yang belum disetujui).
  final ChunkCache? cache;
  final http.Client _client;
  final Duration headerTimeout;
  final Duration idleTimeout;
  final Duration retryBase;

  late bool _useDirect = direct.isNotEmpty;

  int _total = 0;
  int get total => _total;
  bool _opened = false;
  bool _closed = false;
  final _closing = Completer<void>();
  final Map<int, _Pending> _pending = {};
  final Set<int> _have = {};
  int _haveBytes = 0;

  /// Potongan terakhir di memori: PDFium membaca banyak rentang kecil berurutan.
  final Map<int, Uint8List> _memory = {};
  static const _memoryChunks = 6;
  int _foreground = 0;

  /// true selama sambungan bermasalah dan sedang diulang.
  bool get retrying => _retrying;
  bool _retrying = false;

  /// 0..1 dari seluruh buku; null sebelum ukurannya diketahui.
  double? get progress {
    if (_total == 0) return null;
    final got = _haveBytes + _pending.values.fold(0, (n, p) => n + p.received);
    return math.min(1, got / _total);
  }

  bool get complete => _total > 0 && _haveBytes >= _total;

  /// Buku yang diganti berkasnya punya ukuran / alamat lain, jadi potongannya tidak tertukar.
  String get _key => '$id-$_total-${_hash(direct)}';

  static String _hash(String s) {
    var h = 0x811c9dc5;
    for (final c in s.codeUnits) {
      h = ((h ^ c) * 0x01000193) & 0xffffffff;
    }
    return h.toRadixString(16);
  }

  int get _count => (_total + kChunk - 1) ~/ kChunk;
  int _length(int index) => math.min(kChunk, _total - index * kChunk);

  /// Siapkan ukuran berkas. [sizeHint] (dari detail buku) memungkinkan memakai cache
  /// tanpa jaringan.
  Future<void> open({int sizeHint = 0}) async {
    if (sizeHint > 0 && cache != null) {
      _total = sizeHint;
      final cached = await cache!.read(_key, 0, _length(0));
      if (cached != null) {
        _keep(0, cached);
        await _ready();
        return;
      }
      _total = 0;
    }
    final p = _pending[0] = _Pending();
    final Uint8List first;
    try {
      first = await _fetchRetry(0, p);
    } finally {
      _pending.remove(0);
    }
    _keep(0, first);
    await cache?.write(_key, 0, first);
    await _ready();
  }

  Future<void> _ready() async {
    for (var i = 1; i < _count && cache != null; i++) {
      if (await cache!.has(_key, i)) _mark(i);
    }
    _opened = true;
    _tell();
  }

  void _mark(int index) {
    if (_have.add(index)) _haveBytes += _length(index);
  }

  void _keep(int index, Uint8List data) {
    _mark(index);
    _memory.remove(index);
    _memory[index] = data;
    // Tanpa disk semua potongan tetap di memori selama pembaca terbuka.
    if (cache != null && _memory.length > _memoryChunks) {
      _memory.remove(_memory.keys.first);
    }
  }

  /// Dipakai PDFium. Mengisi [buffer] penuh atau melempar.
  Future<int> read(Uint8List buffer, int position, int size) async {
    if (position < 0 || size < 0 || position + size > _total) return 0;
    _foreground++;
    try {
      var done = 0;
      while (done < size) {
        final index = (position + done) ~/ kChunk;
        final chunk = await _chunk(index);
        // Penutupan membebaskan memori PDFium: jangan menulis sesudahnya.
        if (_closed) throw _Closed();
        final from = position + done - index * kChunk;
        final n = math.min(size - done, chunk.length - from);
        buffer.setRange(done, done + n, chunk, from);
        done += n;
      }
      return size;
    } finally {
      _foreground--;
    }
  }

  Future<Uint8List> _chunk(int index) async {
    if (_closed) throw _Closed();
    final hit = _memory.remove(index);
    if (hit != null) return _memory[index] = hit;
    final running = _pending[index];
    if (running != null) return running.done.future;
    final p = _pending[index] = _Pending();
    p.done.future.ignore();
    try {
      var data = await cache?.read(_key, index, _length(index));
      if (data == null) {
        data = await _fetchRetry(index, p);
        await cache?.write(_key, index, data);
      }
      _pending.remove(index);
      _keep(index, data);
      p.done.complete(data);
      _tell();
      return data;
    } catch (e, s) {
      _pending.remove(index);
      p.done.completeError(e, s);
      rethrow;
    }
  }

  Future<Uint8List> _fetchRetry(int index, _Pending p) async {
    for (var n = 0; ; n++) {
      if (_closed) throw _Closed();
      final viaDirect = _useDirect;
      try {
        final data = await _fetch(index, p, viaDirect);
        if (_retrying) {
          _retrying = false;
          _tell();
        }
        return data;
      } catch (e) {
        p.received = 0;
        if (_closed) throw _Closed();
        if (viaDirect) {
          _useDirect = false;
          n = -1;
          continue;
        }
        final status = e is BookSourceException ? e.status : 0;
        // Saat membuka: beberapa kali saja. Setelah terbuka, tunggu sampai sambungan pulih.
        if (const [401, 403, 404, 416].contains(status) ||
            (!_opened && n >= 3)) {
          if (e is BookSourceException) rethrow;
          throw BookSourceException(
            'Buku gagal dimuat. Periksa koneksi internetmu.',
          );
        }
        _retrying = true;
        _tell();
        await _pause(
          math.min(15000, retryBase.inMilliseconds << math.min(n, 6)),
        );
      }
    }
  }

  Future<void> _pause(int ms) => Future.any([
    Future<void>.delayed(Duration(milliseconds: ms)),
    _closing.future,
  ]);

  Future<Uint8List> _fetch(int index, _Pending p, bool viaDirect) async {
    final begin = index * kChunk;
    final end = begin + (_total == 0 ? kChunk : _length(index)) - 1;
    // Rentang ikut di alamat supaya tidak ada cache yang menukar potongan.
    final uri = viaDirect
        ? Uri.parse(direct)
        : proxy.replace(
            queryParameters: {...proxy.queryParameters, 'r': '$begin-$end'},
          );
    final req = http.Request('GET', uri)
      ..headers['Range'] = 'bytes=$begin-$end'
      // Tanpa kompresi: rentang harus merujuk ke byte asli.
      ..headers['Accept-Encoding'] = 'identity';
    if (!viaDirect) req.headers.addAll(headers?.call() ?? const {});
    final res = await _client.send(req).timeout(headerTimeout);
    final stream = res.stream.timeout(idleTimeout);
    // Server yang bukan Vercel (laptop) boleh membalas file utuh.
    if (res.statusCode == 200 && !viaDirect) return _whole(index, stream);
    final cr = RegExp(r'^bytes (\d+)-(\d+)/(\d+)$')
        .firstMatch(res.headers['content-range'] ?? '');
    if (res.statusCode != 206 || cr == null || int.parse(cr[1]!) != begin) {
      unawaited(res.stream.listen(null).cancel());
      throw BookSourceException(
        res.statusCode == 404
            ? 'Buku tidak ditemukan.'
            : 'Buku gagal dimuat (${res.statusCode}).',
        res.statusCode,
      );
    }
    final total = int.parse(cr[3]!);
    final want = int.parse(cr[2]!) - begin + 1;
    if (_total != 0 && total != _total) {
      unawaited(res.stream.listen(null).cancel());
      throw BookSourceException('File buku berubah saat dibaca.', 416);
    }
    if (want != math.min(kChunk, total - begin)) {
      unawaited(res.stream.listen(null).cancel());
      throw BookSourceException('Potongan buku tidak lengkap.');
    }
    _total = total;
    final out = BytesBuilder(copy: false);
    await for (final part in stream) {
      if (_closed) throw _Closed();
      out.add(part);
      if (out.length > want) break;
      p.received = out.length;
      _tell();
    }
    if (out.length != want) {
      throw BookSourceException('Potongan buku tidak lengkap.');
    }
    return out.takeBytes();
  }

  Future<Uint8List> _whole(int index, Stream<List<int>> stream) async {
    final out = BytesBuilder(copy: false);
    await for (final part in stream) {
      if (_closed) throw _Closed();
      out.add(part);
    }
    final all = out.takeBytes();
    if (_total != 0 && all.length != _total) {
      throw BookSourceException('File buku berubah saat dibaca.', 416);
    }
    _total = all.length;
    Uint8List part(int i) =>
        Uint8List.sublistView(all, i * kChunk, i * kChunk + _length(i));
    for (var i = 0; i < _count; i++) {
      if (i == index) continue;
      await cache?.write(_key, i, part(i));
      if (cache == null) _keep(i, part(i));
    }
    return part(index);
  }

  bool _prefetching = false;

  /// Unduh sisa buku ke cache, setelah halaman pertama tampil. Mulai dari posisi baca
  /// [from] (0..1), lalu memutar. Mengalah pada bacaan PDFium yang sedang menunggu.
  Future<void> prefetch({double from = 0}) async {
    final c = cache;
    if (c == null || _prefetching || _total > c.maxBytes) return;
    _prefetching = true;
    try {
      final start = (from.clamp(0, 1) * (_count - 1)).round();
      for (var k = 0; k < _count && !_closed; k++) {
        final i = (start + k) % _count;
        while (_foreground > 0 && !_closed) {
          await _pause(150);
        }
        if (_closed) return;
        if (await c.has(_key, i)) {
          _mark(i);
        } else {
          await _chunk(i);
        }
      }
      _tell();
    } catch (_) {
      // Unduhan latar boleh gagal; halaman yang dibuka tetap diambil sendiri.
    } finally {
      _prefetching = false;
    }
  }

  void _tell() {
    if (!_closed) notifyListeners();
  }

  /// Bacaan yang masih menunggu langsung gagal.
  void close() {
    if (_closed) return;
    _closed = true;
    _closing.complete();
    _client.close();
    dispose();
  }
}
