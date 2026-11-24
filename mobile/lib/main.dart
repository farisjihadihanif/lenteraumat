import 'package:material_ui/material_ui.dart';
import 'package:pdfrx/pdfrx.dart';

import 'api.dart';
import 'nav.dart';
import 'reader/chunk_cache.dart';
import 'screens/account.dart';
import 'screens/discussions.dart';
import 'screens/home.dart';
import 'screens/library.dart';
import 'state.dart';
import 'theme.dart';
import 'widgets/ui.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  pdfrxFlutterInitialize();
  registerFontLicenses();
  final state = AppState(ApiClient(), cache: ChunkCache())
    ..loadPrefs()
    ..bootstrap();
  runApp(LenteraApp(state: state));
}

class LenteraApp extends StatelessWidget {
  const LenteraApp({super.key, required this.state});
  final AppState state;

  @override
  Widget build(BuildContext context) => AppScope(
    state: state,
    child: Builder(
      builder: (context) => MaterialApp(
        title: 'LenteraUmat',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(Brightness.light),
        darkTheme: buildTheme(Brightness.dark),
        themeMode: AppScope.of(context).theme,
        home: const Shell(),
      ),
    ),
  );
}

class Shell extends StatefulWidget {
  const Shell({super.key});
  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  /// Tab baru dibuat saat pertama dibuka.
  final _seen = <int>{};

  static const _screens = [
    HomeScreen(),
    LibraryScreen(),
    _Soon('LUMA'),
    DiscussionsScreen(),
    AccountScreen(),
  ];

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<int>(
    valueListenable: tab,
    builder: (context, index, _) {
      _seen.add(index);
      return PopScope(
        canPop: index == tabHome,
        onPopInvokedWithResult: (popped, _) {
          if (!popped) tab.value = tabHome;
        },
        child: Scaffold(
          body: IndexedStack(
            index: index,
            children: [
              for (var i = 0; i < _screens.length; i++)
                _seen.contains(i) ? _screens[i] : const SizedBox.shrink(),
            ],
          ),
          bottomNavigationBar: NavigationBar(
            selectedIndex: index,
            onDestinationSelected: (i) => tab.value = i,
            destinations: const [
              NavigationDestination(
                icon: Icon(Icons.home_outlined),
                label: 'Home',
              ),
              NavigationDestination(
                icon: Icon(Icons.local_library_outlined),
                label: 'Library',
              ),
              NavigationDestination(
                icon: Icon(Icons.auto_awesome_outlined),
                label: 'LUMA',
              ),
              NavigationDestination(
                icon: Icon(Icons.forum_outlined),
                label: 'Discussions',
              ),
              NavigationDestination(
                icon: Icon(Icons.person_outline),
                label: 'Profile',
              ),
            ],
          ),
        ),
      );
    },
  );
}

/// Tempat layar yang belum dibuat (langkah 5 dan 6).
class _Soon extends StatelessWidget {
  const _Soon(this.title);
  final String title;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(title)),
    body: const Center(
      child: Empty(title: 'Coming soon', body: 'Bagian ini sedang disiapkan.'),
    ),
  );
}
