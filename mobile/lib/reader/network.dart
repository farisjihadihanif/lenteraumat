import 'package:connectivity_plus/connectivity_plus.dart';

/// Jenis sambungan, untuk unduhan buku di latar.
class Network {
  static bool isWifi(List<ConnectivityResult> r) =>
      !r.contains(ConnectivityResult.mobile) &&
      (r.contains(ConnectivityResult.wifi) ||
          r.contains(ConnectivityResult.ethernet));

  /// Tidak bisa dipastikan = dianggap bukan Wi-Fi.
  Future<bool> onWifi() async {
    try {
      return isWifi(await Connectivity().checkConnectivity());
    } catch (_) {
      return false;
    }
  }

  Stream<void> get changes => Connectivity().onConnectivityChanged;
}
