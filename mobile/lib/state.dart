import 'dart:convert';

import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'reader/chunk_cache.dart';

/// Sesi, tema, dan cache buku. Token ada di secure storage lewat [ApiClient].
class AppState extends ChangeNotifier {
  AppState(this.api, {this.cache}) {
    api.onUnauthorized = _clearUser;
  }

  final ApiClient api;
  final ChunkCache? cache;

  static const _userKey = 'auth_user';
  static const _themeKey = 'lenteraumat-tema';

  Json? _user;
  Json? get user => _user;
  bool get signedIn => _user != null;
  bool isMe(Object? id) => _user != null && id != null && _user!['_id'] == id;
  bool get isAdmin => _user?['role'] == 'admin';

  ThemeMode _theme = ThemeMode.system;
  ThemeMode get theme => _theme;

  Future<void> loadTheme() async {
    try {
      final v = (await SharedPreferences.getInstance()).getString(_themeKey);
      _theme = ThemeMode.values.asNameMap()[v] ?? ThemeMode.system;
      notifyListeners();
    } catch (_) {
      // Penyimpanan tidak tersedia: ikut sistem.
    }
  }

  Future<void> setTheme(ThemeMode v) async {
    _theme = v;
    notifyListeners();
    try {
      await (await SharedPreferences.getInstance()).setString(
        _themeKey,
        v.name,
      );
    } catch (_) {}
  }

  /// Pulihkan sesi. Tanpa jaringan (atau 429/5xx) profil tersimpan tetap dipakai;
  /// hanya token yang ditolak server yang mengeluarkan akun.
  Future<void> bootstrap() async {
    try {
      await api.loadToken();
      if (api.token == null) return;
      final raw = await api.secrets.read(_userKey);
      if (raw != null) {
        _user = jsonDecode(raw) as Json;
        notifyListeners();
      }
    } catch (_) {
      if (api.token == null) return;
    }
    await refresh();
  }

  /// Segarkan profil dan perpanjang token.
  Future<void> refresh() async {
    final before = api.token;
    if (before == null) return;
    try {
      final r = await api.get('/auth/me');
      if (api.token != before) return; // keluar / ganti akun di sela-selanya
      if (r['user'] == null) {
        // API versi lama membalas "tamu" untuk token mati.
        await logout();
      } else {
        await _adopt(r);
      }
    } on ApiException {
      // 401 sudah ditangani klien; galat lain dicoba lagi saat aplikasi dibuka.
    }
  }

  Future<void> login(String identifier, String password) async => _start(
    await api.post('/auth/login', {
      'identifier': identifier,
      'password': password,
    }),
  );

  Future<void> register(Json form) async =>
      _start(await api.post('/auth/register', form));

  Future<void> _start(Json r) async {
    if (r['token'] is! String) {
      throw ApiException(
        500,
        'Server belum mendukung masuk dari aplikasi. Coba lagi nanti.',
      );
    }
    await _adopt(r);
  }

  Future<void> changePassword(String lama, String baru) async {
    final r = await api.put('/users/me/password', {
      'passwordLama': lama,
      'passwordBaru': baru,
    });
    if (r['token'] is String) await api.setToken(r['token'] as String);
  }

  Future<void> deleteAccount(String password) async {
    await api.delete('/users/me', {'password': password});
    await logout();
  }

  /// Keluar dari perangkat ini.
  Future<void> logout() async {
    await api.setToken(null);
    await _clearUser();
  }

  Future<void> _adopt(Json r) async {
    if (r['token'] is String) await api.setToken(r['token'] as String);
    _user = r['user'] as Json;
    await api.secrets.write(_userKey, jsonEncode(_user));
    notifyListeners();
  }

  Future<void> _clearUser() async {
    _user = null;
    notifyListeners();
    await api.secrets.delete(_userKey);
  }
}

class AppScope extends InheritedNotifier<AppState> {
  const AppScope({super.key, required AppState state, required super.child})
    : super(notifier: state);

  static AppState of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<AppScope>()!.notifier!;

  /// Tanpa ikut dibangun ulang (initState & penangan ketukan).
  static AppState read(BuildContext context) =>
      context.getInheritedWidgetOfExactType<AppScope>()!.notifier!;
}
