import 'package:material_ui/material_ui.dart';

import 'api.dart';
import 'screens/auth.dart';
import 'state.dart';

/// Tab aktif di bilah bawah.
final tab = ValueNotifier<int>(tabHome);
const tabHome = 0, tabLibrary = 1, tabLuma = 2, tabDiscussions = 3;

Future<T?> push<T>(BuildContext context, Widget screen) =>
    Navigator.of(context).push<T>(MaterialPageRoute(builder: (_) => screen));

/// Permintaan ke tab LUMA dari layar lain; diambil sekali oleh LumaScreen.
final lumaRequest = ValueNotifier<({String mode, Json? book})?>(null);

void openLuma(BuildContext context, {String mode = 'chat', Json? book}) {
  lumaRequest.value = (mode: mode, book: book);
  openTab(context, tabLuma);
}

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
