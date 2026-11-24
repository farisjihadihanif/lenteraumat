import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import 'config.dart';

typedef Json = Map<String, dynamic>;

class ApiException implements Exception {
  ApiException(this.status, this.message);

  /// 0 = gagal jaringan / waktu habis.
  final int status;
  final String message;

  @override
  String toString() => message;
}

/// Penyimpanan rahasia sesi.
abstract class SecretStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

/// flutter_secure_storage 11 di Android: AES-GCM, kuncinya dibungkus Android Keystore.
/// (Opsi encryptedSharedPreferences sudah dihapus paketnya di versi 11.)
class SecureSecretStore implements SecretStore {
  const SecureSecretStore();

  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(
      keyCipherAlgorithm:
          KeyCipherAlgorithm.RSA_ECB_OAEPwithSHA_256andMGF1Padding,
      storageCipherAlgorithm: StorageCipherAlgorithm.AES_GCM_NoPadding,
      resetOnError: true,
    ),
  );

  @override
  Future<String?> read(String key) => _storage.read(key: key);
  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);
  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}

/// Simpan di memori saja (tes).
class MemorySecretStore implements SecretStore {
  MemorySecretStore([Map<String, String>? isi]) : isi = isi ?? {};
  final Map<String, String> isi;

  @override
  Future<String?> read(String key) async => isi[key];
  @override
  Future<void> write(String key, String value) async => isi[key] = value;
  @override
  Future<void> delete(String key) async => isi.remove(key);
}

const _offline = 'Tidak bisa terhubung ke server. Periksa koneksi internetmu.';

/// Klien API. Masuk memakai `Authorization: Bearer` + `X-Client: mobile` (tanpa cookie).
class ApiClient {
  ApiClient({
    http.Client? client,
    SecretStore? secrets,
    String? baseUrl,
    this.timeout = const Duration(seconds: 30),
  }) : _http = client ?? http.Client(),
       secrets = secrets ?? const SecureSecretStore(),
       base = baseUrl ?? apiBase;

  final http.Client _http;
  final SecretStore secrets;
  final String base;
  final Duration timeout;

  static const _tokenKey = 'auth_token';
  String? _token;
  String? get token => _token;

  /// Dipanggil saat token yang sedang dipakai ditolak (401).
  void Function()? onUnauthorized;

  Future<void> loadToken() async => _token = await secrets.read(_tokenKey);

  Future<void> setToken(String? token) async {
    _token = token;
    if (token == null) {
      await secrets.delete(_tokenKey);
    } else {
      await secrets.write(_tokenKey, token);
    }
  }

  Map<String, String> authHeaders() => {
    'X-Client': 'mobile',
    if (_token != null) 'Authorization': 'Bearer $_token',
  };

  Uri uri(String path, [Map<String, Object?>? query]) {
    final q = {
      for (final e in (query ?? const {}).entries)
        if (e.value != null && '${e.value}'.isNotEmpty) e.key: '${e.value}',
    };
    final u = Uri.parse('$base/api$path');
    return q.isEmpty ? u : u.replace(queryParameters: q);
  }

  Future<Json> get(String path, {Map<String, Object?>? query}) =>
      _send('GET', path, query: query);
  Future<Json> post(String path, [Object? body]) =>
      _send('POST', path, body: body);
  Future<Json> put(String path, [Object? body]) =>
      _send('PUT', path, body: body);
  Future<Json> patch(String path, [Object? body]) =>
      _send('PATCH', path, body: body);
  Future<Json> delete(String path, [Object? body]) =>
      _send('DELETE', path, body: body);

  /// Formulir dengan berkas (multipart).
  Future<Json> form(
    String method,
    String path, {
    Map<String, String> fields = const {},
    List<FormFile> files = const [],
    void Function(double progress)? onProgress,
  }) async {
    final sent = _token;
    final req = ProgressRequest(method, uri(path), onProgress)
      ..headers.addAll(authHeaders())
      ..fields.addAll(fields);
    for (final f in files) {
      req.files.add(await f.part());
    }
    return _receive(sent, req, const Duration(minutes: 5));
  }

  Future<Json> _send(
    String method,
    String path, {
    Map<String, Object?>? query,
    Object? body,
    Duration? timeout,
  }) => _receive(
    _token,
    _jsonRequest(method, path, body, query),
    timeout ?? this.timeout,
  );

  /// Permintaan lama (LUMA menyusun kuis): batas waktu mengikuti server (120 dtk).
  Future<Json> postSlow(String path, [Object? body]) =>
      _send('POST', path, body: body, timeout: const Duration(seconds: 130));

  http.Request _jsonRequest(
    String method,
    String path,
    Object? body, [
    Map<String, Object?>? query,
  ]) {
    final req = http.Request(method, uri(path, query))
      ..headers.addAll(authHeaders());
    if (body != null) {
      req.headers['Content-Type'] = 'application/json';
      req.body = jsonEncode(body);
    }
    return req;
  }

  Future<Json> _receive(
    String? sent,
    http.BaseRequest req,
    Duration timeout,
  ) async {
    final http.Response res;
    try {
      res = await _http
          .send(req)
          .then(http.Response.fromStream)
          .timeout(timeout);
    } catch (_) {
      throw ApiException(0, _offline);
    }
    return _result(sent, res);
  }

  Future<Json> _result(String? sent, http.Response res) async {
    Object? data;
    try {
      data = jsonDecode(utf8.decode(res.bodyBytes));
    } catch (_) {
      data = null;
    }
    if (res.statusCode >= 200 && res.statusCode < 300 && data is Json) {
      return data;
    }
    // Hanya token yang memang ditolak yang dihapus, bukan token baru hasil masuk di sela-selanya.
    if (res.statusCode == 401 && sent != null && sent == _token) {
      await setToken(null);
      onUnauthorized?.call();
    }
    final pesan = data is Json ? data['message'] : null;
    throw ApiException(
      res.statusCode,
      pesan is String
          ? pesan
          : res.statusCode == 413
          ? 'File terlalu besar untuk dikirim. Coba file di bawah 4 MB.'
          : 'Terjadi kesalahan (${res.statusCode}).',
    );
  }

  /// Jawaban LUMA dialirkan (server-sent events). [onText] menerima seluruh teks sejauh ini.
  /// Aliran yang putus di tengah diulang tanpa streaming, seperti di web: server tidak
  /// menyimpan jawaban yang sambungannya putus. Galat dari server tidak diulang.
  Future<Json> stream(
    String path, {
    required Map<String, Object?> body,
    List<FormFile> files = const [],
    required void Function(String text) onText,
  }) async {
    Future<http.BaseRequest> build() async {
      if (files.isEmpty) return _jsonRequest('POST', path, body);
      final r = http.MultipartRequest('POST', uri(path))
        ..headers.addAll(authHeaders());
      for (final e in body.entries) {
        if (e.value != null) r.fields[e.key] = '${e.value}';
      }
      for (final f in files) {
        r.files.add(await f.part());
      }
      return r;
    }

    const limit = Duration(seconds: 130);
    final sent = _token;
    final http.StreamedResponse res;
    try {
      final req = await build();
      req.headers['Accept'] = 'text/event-stream';
      res = await _http.send(req).timeout(limit);
    } catch (_) {
      throw ApiException(0, _offline);
    }
    if (!(res.headers['content-type'] ?? '').contains('text/event-stream')) {
      try {
        return await _result(
          sent,
          await http.Response.fromStream(res).timeout(limit),
        );
      } on ApiException {
        rethrow;
      } catch (_) {
        throw ApiException(0, _offline);
      }
    }
    var text = '';
    try {
      final lines = res.stream
          .timeout(limit)
          .transform(utf8.decoder)
          .transform(const LineSplitter());
      await for (final line in lines) {
        if (!line.startsWith('data:')) continue;
        final e = jsonDecode(line.substring(5)) as Json;
        if (e['error'] case final Json err) {
          throw ApiException(
            (err['status'] as num?)?.toInt() ?? 500,
            '${err['message']}',
          );
        }
        if (e['done'] case final Json done) return done;
        text = e['reset'] == true ? '' : '$text${e['text'] ?? ''}';
        onText(text);
      }
    } on ApiException {
      rethrow;
    } catch (_) {
      // Aliran putus.
    }
    onText('');
    return _receive(sent, await build(), limit);
  }

  /// Kirim ke layanan lain (Cloudinary): tanpa token dan tanpa header aplikasi.
  Future<Json> external(
    String url, {
    required Map<String, String> fields,
    required FormFile file,
    void Function(double progress)? onProgress,
  }) async {
    final req = ProgressRequest('POST', Uri.parse(url), onProgress)
      ..fields.addAll(fields);
    req.files.add(await file.part());
    final http.Response res;
    try {
      res = await _http
          .send(req)
          .then(http.Response.fromStream)
          .timeout(const Duration(minutes: 10));
    } catch (_) {
      throw ApiException(0, 'Koneksi terputus saat mengunggah.');
    }
    Object? data;
    try {
      data = jsonDecode(res.body);
    } catch (_) {}
    if (res.statusCode >= 200 && res.statusCode < 300 && data is Json) {
      return data;
    }
    final err = data is Json ? data['error'] : null;
    throw ApiException(
      res.statusCode,
      err is Json && err['message'] is String
          ? err['message'] as String
          : 'Upload gagal (${res.statusCode}).',
    );
  }
}

/// Berkas untuk [ApiClient.form].
class FormFile {
  FormFile({
    required this.field,
    required this.path,
    required this.name,
    required this.type,
    required this.size,
  });
  final String field, path, name, type;
  final int size;

  FormFile as(String field) =>
      FormFile(field: field, path: path, name: name, type: type, size: size);

  Future<http.MultipartFile> part() => http.MultipartFile.fromPath(
    field,
    path,
    filename: name,
    contentType: MediaType.parse(type),
  );
}

/// Multipart dengan kemajuan 0..1.
class ProgressRequest extends http.MultipartRequest {
  ProgressRequest(super.method, super.url, this.onProgress);
  final void Function(double progress)? onProgress;

  @override
  http.ByteStream finalize() {
    final source = super.finalize();
    final f = onProgress;
    if (f == null) return source;
    final total = contentLength;
    var sent = 0;
    return http.ByteStream(
      source.map((chunk) {
        sent += chunk.length;
        f(total == 0 ? 1 : sent / total);
        return chunk;
      }),
    );
  }
}

/// Simpan buku. PDF & sampul diunggah langsung ke Cloudinary dengan tanda tangan dari API;
/// tanpa Cloudinary (API lokal) ikut di body.
Future<Json> saveBook(
  ApiClient api, {
  String? id,
  required Map<String, String> fields,
  FormFile? pdf,
  FormFile? cover,
  void Function(double progress)? onProgress,
}) async {
  final method = id == null ? 'POST' : 'PATCH';
  final path = id == null ? '/books' : '/books/$id';
  final parts = [
    if (pdf != null) (pdf, 'buku', 'fileUpload', 'file'),
    if (cover != null) (cover, 'sampul', 'coverUpload', 'cover'),
  ];
  final signed = [
    for (final (f, kind, _, _) in parts)
      await api.post('/uploads/sign', {
        'kind': kind,
        'type': f.type,
        'size': f.size,
      }),
  ];
  if (signed.any((s) => s['direct'] != true)) {
    return api.form(
      method,
      path,
      fields: fields,
      files: [for (final (f, _, _, form) in parts) f.as(form)],
      onProgress: onProgress,
    );
  }
  final body = <String, Object?>{...fields};
  final total = parts.fold(0, (n, p) => n + p.$1.size);
  var done = 0;
  for (var i = 0; i < parts.length; i++) {
    final (f, _, key, _) = parts[i];
    final r = await api.external(
      '${signed[i]['url']}',
      fields: {
        for (final e in (signed[i]['fields'] as Json).entries)
          e.key: '${e.value}',
      },
      file: f.as('file'),
      onProgress: (p) => onProgress?.call((done + f.size * p) / total),
    );
    done += f.size;
    body[key] = {
      'public_id': r['public_id'],
      'version': r['version'],
      'signature': r['signature'],
    };
  }
  onProgress?.call(1);
  // Server memeriksa berkas yang sudah tersimpan.
  return api._send(
    method,
    path,
    body: body,
    timeout: const Duration(seconds: 130),
  );
}
