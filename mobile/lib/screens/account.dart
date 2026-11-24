import 'package:material_ui/material_ui.dart';

import '../config.dart';
import '../format.dart';
import '../nav.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/ui.dart';
import 'auth.dart';

/// Tab Profile. Rak, unggah, ubah profil, password, dan hapus akun menyusul.
class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final c = Lu.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (s.signedIn)
            Panel(
              child: Row(
                children: [
                  Avatar(s.user, size: 52),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          displayName(s.user),
                          style: serifStyle(context, 18),
                        ),
                        Text(
                          '@${s.user!['username']}',
                          style: TextStyle(color: c.inkMute),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            )
          else
            Panel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'Masuk untuk menyimpan buku, memberi ulasan, berdiskusi, dan memakai LUMA.',
                  ),
                  const SizedBox(height: 14),
                  FilledButton(
                    onPressed: () => push<void>(context, const LoginScreen()),
                    child: const Text('Sign in'),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 24),
          Text('Appearance', style: serifStyle(context, 18)),
          const SizedBox(height: 10),
          SegmentedButton<ThemeMode>(
            showSelectedIcon: false,
            segments: const [
              ButtonSegment(value: ThemeMode.system, label: Text('System')),
              ButtonSegment(value: ThemeMode.light, label: Text('Light')),
              ButtonSegment(value: ThemeMode.dark, label: Text('Dark')),
            ],
            selected: {s.theme},
            onSelectionChanged: (v) => s.setTheme(v.first),
          ),
          const SizedBox(height: 24),
          Text('About', style: serifStyle(context, 18)),
          for (final (label, path) in const [
            ('Terms', 'ketentuan'),
            ('Privacy Policy', 'privasi'),
            ('Copyright', 'hak-cipta'),
          ])
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(label),
              trailing: const Icon(Icons.open_in_new, size: 18),
              onTap: () => openLink(context, '$webBase/$path'),
            ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Licenses'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => showLicensePage(
              context: context,
              applicationName: 'LenteraUmat',
            ),
          ),
          if (s.signedIn) ...[
            const SizedBox(height: 16),
            OutlinedButton.icon(
              icon: const Icon(Icons.logout),
              label: const Text('Sign out'),
              onPressed: s.logout,
            ),
          ],
        ],
      ),
    );
  }
}
