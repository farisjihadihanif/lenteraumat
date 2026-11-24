import 'dart:io';

import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../format.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/pick.dart';
import '../widgets/ui.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});
  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late final Json _me = AppScope.read(context).user ?? const {};
  late final _c = {
    for (final k in const ['namaLengkap', 'bio', 'instagramUrl', 'linkedinUrl'])
      k: TextEditingController(text: text(_me[k])),
  };
  final _old = TextEditingController();
  final _new = TextEditingController();
  FormFile? _foto;
  String _busy = '';
  String _profileError = '';
  String _pwError = '';

  @override
  void dispose() {
    for (final c in [..._c.values, _old, _new]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _saveProfile() async {
    setState(() {
      _busy = 'profil';
      _profileError = '';
    });
    try {
      await AppScope.read(context).saveProfile({
        for (final e in _c.entries) e.key: e.value.text.trim(),
      }, _foto);
      if (!mounted) return;
      setState(() => _foto = null);
      toast(context, 'Profil tersimpan.');
    } catch (e) {
      if (mounted) setState(() => _profileError = errorText(e));
    }
    if (mounted) setState(() => _busy = '');
  }

  Future<void> _savePassword() async {
    if (_new.text.length < 8) {
      return setState(() => _pwError = 'Password baru minimal 8 karakter.');
    }
    setState(() {
      _busy = 'pw';
      _pwError = '';
    });
    try {
      await AppScope.read(context).changePassword(_old.text, _new.text);
      if (!mounted) return;
      _old.clear();
      _new.clear();
      toast(context, 'Password diganti. Perangkat lain otomatis keluar.');
    } catch (e) {
      if (mounted) setState(() => _pwError = errorText(e));
    }
    if (mounted) setState(() => _busy = '');
  }

  Future<void> _pickFoto() async {
    try {
      final f = await pickPhoto(side: 800);
      if (f != null && mounted) setState(() => _foto = f);
    } catch (e) {
      if (mounted) toast(context, errorText(e));
    }
  }

  Future<void> _delete() async {
    final done = await showDialog<bool>(
      context: context,
      builder: (_) => const _DeleteAccount(),
    );
    if (done != true || !mounted) return;
    toast(context, 'Akun dihapus.');
    Navigator.of(context).popUntil((r) => r.isFirst);
  }

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final c = Lu.of(context);
    final me = s.user;
    if (me == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Settings')),
        body: const Empty(
          title: 'Signed out',
          body: 'Sesi berakhir. Silakan masuk lagi.',
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Profile', style: serifStyle(context, 18)),
                const SizedBox(height: 14),
                Row(
                  children: [
                    if (_foto == null)
                      Avatar(me, size: 64)
                    else
                      ClipOval(
                        child: Image.file(
                          File(_foto!.path),
                          width: 64,
                          height: 64,
                          fit: BoxFit.cover,
                          cacheWidth: 200,
                        ),
                      ),
                    const SizedBox(width: 12),
                    TextButton(
                      onPressed: _pickFoto,
                      child: const Text('Change photo'),
                    ),
                    if (_foto != null)
                      TextButton(
                        onPressed: () => setState(() => _foto = null),
                        child: const Text('Undo'),
                      ),
                  ],
                ),
                const SizedBox(height: 14),
                _field(_c['namaLengkap']!, 'Nama lengkap', max: 100),
                _field(_c['bio']!, 'Bio', max: 300, lines: 3),
                _field(
                  _c['instagramUrl']!,
                  'Instagram',
                  hint: 'https://instagram.com/…',
                ),
                _field(
                  _c['linkedinUrl']!,
                  'LinkedIn',
                  hint: 'https://linkedin.com/in/…',
                ),
                Text(
                  'Email: ${me['email']} · Username: @${me['username']}',
                  style: TextStyle(fontSize: 13, color: c.inkMute),
                ),
                const SizedBox(height: 12),
                ErrorBox(_profileError),
                FilledButton(
                  onPressed: _busy.isEmpty ? _saveProfile : null,
                  child: Text(_busy == 'profil' ? 'Saving…' : 'Save profile'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Change password', style: serifStyle(context, 18)),
                const SizedBox(height: 14),
                _field(
                  _old,
                  'Password lama',
                  secret: true,
                  hints: const [AutofillHints.password],
                ),
                _field(
                  _new,
                  'Password baru',
                  secret: true,
                  hints: const [AutofillHints.newPassword],
                ),
                ErrorBox(_pwError),
                OutlinedButton(
                  onPressed: _busy.isEmpty ? _savePassword : null,
                  child: const Text('Change password'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Delete account',
                  style: serifStyle(context, 18).copyWith(color: c.danger),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Akun, buku unggahan, ulasan, diskusi, dan riwayat LUMA milikmu akan dihapus permanen.',
                ),
                TextButton(
                  onPressed: _busy.isEmpty ? _delete : null,
                  child: Text(
                    'Delete my account',
                    style: TextStyle(color: c.danger),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _field(
    TextEditingController controller,
    String label, {
    int? max,
    int lines = 1,
    String? hint,
    bool secret = false,
    List<String>? hints,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: TextField(
      controller: controller,
      maxLength: max,
      minLines: lines,
      maxLines: lines,
      obscureText: secret,
      autofillHints: hints,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        counterText: '',
      ),
    ),
  );
}

class _DeleteAccount extends StatefulWidget {
  const _DeleteAccount();
  @override
  State<_DeleteAccount> createState() => _DeleteAccountState();
}

class _DeleteAccountState extends State<_DeleteAccount> {
  final _pw = TextEditingController();
  bool _busy = false;
  String _error = '';

  @override
  void dispose() {
    _pw.dispose();
    super.dispose();
  }

  Future<void> _run() async {
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      await AppScope.read(context).deleteAccount(_pw.text);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = errorText(e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Delete account permanently?'),
    content: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text(
            'Ketik password untuk mengonfirmasi. Tindakan ini tidak bisa dibatalkan.',
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _pw,
            obscureText: true,
            autofillHints: const [AutofillHints.password],
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(labelText: 'Password'),
          ),
          const SizedBox(height: 12),
          ErrorBox(_error),
        ],
      ),
    ),
    actions: [
      TextButton(
        onPressed: _busy ? null : () => Navigator.pop(context),
        child: const Text('Cancel'),
      ),
      TextButton(
        onPressed: _busy || _pw.text.isEmpty ? null : _run,
        child: Text(
          _busy ? 'Deleting…' : 'Delete account',
          style: TextStyle(color: Lu.of(context).danger),
        ),
      ),
    ],
  );
}
