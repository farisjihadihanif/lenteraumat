import 'package:material_ui/material_ui.dart';

import '../config.dart';
import '../format.dart';
import '../nav.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/ui.dart';
import 'auth.dart';
import 'settings.dart';
import 'shelf.dart';
import 'upload_book.dart';
import 'user_profile.dart';

/// Tab Profile: akun, rak, unggah, tampilan, unduhan.
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
          if (s.signedIn) ...[
            const SizedBox(height: 12),
            for (final (icon, label, screen) in [
              (
                Icons.person_outline,
                'My profile',
                UserProfileScreen(username: '${s.user!['username']}'),
              ),
              (
                Icons.collections_bookmark_outlined,
                'My Shelf',
                const ShelfScreen(),
              ),
              (
                Icons.upload_file_outlined,
                'Upload book',
                const UploadBookScreen(),
              ),
              (Icons.settings_outlined, 'Settings', const SettingsScreen()),
            ])
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(icon),
                title: Text(label),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => push<void>(context, screen),
              ),
          ],
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
          Text('Reading', style: serifStyle(context, 18)),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Download whole book on mobile data'),
            subtitle: const Text(
              'Bawaan: sisa buku hanya diunduh lewat Wi-Fi. Halaman yang dibuka selalu dimuat.',
            ),
            value: s.mobileData,
            onChanged: s.setMobileData,
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
