import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

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

  Future<Json> _send(
    String method,
    String path, {
    Map<String, Object?>? query,
    Object? body,
  }) async {
    final sent = _token;
    final req = http.Request(method, uri(path, query))
      ..headers.addAll(authHeaders());
    if (body != null) {
      req.headers['Content-Type'] = 'application/json';
      req.body = jsonEncode(body);
    }
    final http.Response res;
    try {
      res = await _http
          .send(req)
          .then(http.Response.fromStream)
          .timeout(timeout);
    } catch (_) {
      throw ApiException(0, _offline);
    }
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
      pesan is String ? pesan : 'Terjadi kesalahan (${res.statusCode}).',
    );
  }
}
