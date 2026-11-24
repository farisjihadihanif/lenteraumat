import 'package:material_ui/material_ui.dart';

import 'screens/auth.dart';
import 'state.dart';

/// Tab aktif di bilah bawah.
final tab = ValueNotifier<int>(tabHome);
const tabHome = 0, tabLibrary = 1, tabLuma = 2, tabDiscussions = 3;

Future<T?> push<T>(BuildContext context, Widget screen) =>
    Navigator.of(context).push<T>(MaterialPageRoute(builder: (_) => screen));

/// Pindah tab, menutup layar di atasnya.
void openTab(BuildContext context, int index) {
  Navigator.of(context).popUntil((r) => r.isFirst);
  tab.value = index;
}

/// Minta masuk bila masih tamu. true = sudah masuk.
Future<bool> requireLogin(BuildContext context) async {
  final s = AppScope.read(context);
  if (s.signedIn) return true;
  await push<void>(context, const LoginScreen());
  return s.signedIn;
}
