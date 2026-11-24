import 'package:material_ui/material_ui.dart';

import '../config.dart';
import '../nav.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class _Shell extends StatelessWidget {
  const _Shell({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(),
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Image.asset('assets/brand/luma.png', width: 56, height: 56),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(title, style: serifStyle(context, 24)),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                Panel(
                  padding: const EdgeInsets.all(20),
                  child: AutofillGroup(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: children,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

class _Field extends StatefulWidget {
  const _Field(
    this.label,
    this.controller, {
    this.hints = const [],
    this.secret = false,
    this.helper,
    this.keyboard,
    this.onSubmitted,
  });
  final String label;
  final TextEditingController controller;
  final List<String> hints;
  final bool secret;
  final String? helper;
  final TextInputType? keyboard;
  final VoidCallback? onSubmitted;
  @override
  State<_Field> createState() => _FieldState();
}

class _FieldState extends State<_Field> {
  bool _show = false;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: TextField(
      controller: widget.controller,
      autofillHints: widget.hints,
      keyboardType: widget.keyboard,
      obscureText: widget.secret && !_show,
      autocorrect: false,
      enableSuggestions: !widget.secret,
      textInputAction: widget.onSubmitted == null
          ? TextInputAction.next
          : TextInputAction.done,
      onSubmitted: (_) => widget.onSubmitted?.call(),
      decoration: InputDecoration(
        labelText: widget.label,
        helperText: widget.helper,
        suffixIcon: widget.secret
            ? IconButton(
                tooltip: _show ? 'Hide password' : 'Show password',
                icon: Icon(_show ? Icons.visibility_off : Icons.visibility),
                onPressed: () => setState(() => _show = !_show),
              )
            : null,
      ),
    ),
  );
}

/// Status kirim formulir: sibuk, galat, dan pengaman `mounted`.
mixin _Submit<T extends StatefulWidget> on State<T> {
  bool busy = false;
  String error = '';

  Future<void> submit(Future<void> Function() run) async {
    if (busy) return;
    FocusScope.of(context).unfocus();
    setState(() {
      busy = true;
      error = '';
    });
    try {
      await run();
    } catch (e) {
      if (mounted) setState(() => error = errorText(e));
    }
    if (mounted) setState(() => busy = false);
  }
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> with _Submit {
  final _id = TextEditingController();
  final _pw = TextEditingController();

  @override
  void dispose() {
    _id.dispose();
    _pw.dispose();
    super.dispose();
  }

  Future<void> _login() => submit(() async {
    if (_id.text.trim().isEmpty || _pw.text.isEmpty) {
      setState(() => error = 'Isi username/email dan password.');
      return;
    }
    await AppScope.read(context).login(_id.text.trim(), _pw.text);
    if (mounted) Navigator.pop(context);
  });

  @override
  Widget build(BuildContext context) => _Shell(
    title: 'Sign in to LenteraUmat',
    children: [
      _Field('Username atau email', _id, hints: const [AutofillHints.username]),
      _Field(
        'Password',
        _pw,
        secret: true,
        hints: const [AutofillHints.password],
        onSubmitted: _login,
      ),
      Align(
        alignment: Alignment.centerRight,
        child: TextButton(
          onPressed: () => push<void>(context, const ForgotScreen()),
          child: const Text('Forgot password?'),
        ),
      ),
      ErrorBox(error),
      FilledButton(
        onPressed: busy ? null : _login,
        child: Text(busy ? 'Signing in…' : 'Sign in'),
      ),
      const SizedBox(height: 12),
      Wrap(
        alignment: WrapAlignment.center,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          const Text('Belum punya akun?'),
          TextButton(
            onPressed: () async {
              await push<void>(context, const RegisterScreen());
              if (context.mounted && AppScope.read(context).signedIn) {
                Navigator.pop(context);
              }
            },
            child: const Text('Sign up'),
          ),
        ],
      ),
    ],
  );
}

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});
  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> with _Submit {
  final _nama = TextEditingController();
  final _user = TextEditingController();
  final _email = TextEditingController();
  final _pw = TextEditingController();

  @override
  void dispose() {
    for (final c in [_nama, _user, _email, _pw]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _register() => submit(() async {
    if (_pw.text.length < 8) {
      setState(() => error = 'Password minimal 8 karakter.');
      return;
    }
    await AppScope.read(context).register({
      'namaLengkap': _nama.text.trim(),
      'username': _user.text.trim().toLowerCase(),
      'email': _email.text.trim(),
      'password': _pw.text,
    });
    if (mounted) Navigator.pop(context);
  });

  @override
  Widget build(BuildContext context) => _Shell(
    title: 'Create account',
    children: [
      _Field('Nama lengkap', _nama, hints: const [AutofillHints.name]),
      _Field(
        'Username',
        _user,
        hints: const [AutofillHints.newUsername],
        helper: 'Huruf kecil, angka, titik, atau garis bawah.',
      ),
      _Field(
        'Email',
        _email,
        keyboard: TextInputType.emailAddress,
        hints: const [AutofillHints.email],
      ),
      _Field(
        'Password',
        _pw,
        secret: true,
        hints: const [AutofillHints.newPassword],
        helper: 'Minimal 8 karakter.',
        onSubmitted: _register,
      ),
      ErrorBox(error),
      Text(
        'Dengan mendaftar, kamu menyetujui Terms dan Privacy Policy LenteraUmat.',
        style: TextStyle(fontSize: 12, color: Lu.of(context).inkMute),
      ),
      Wrap(
        children: [
          TextButton(
            onPressed: () => openLink(context, '$webBase/ketentuan'),
            child: const Text('Terms'),
          ),
          TextButton(
            onPressed: () => openLink(context, '$webBase/privasi'),
            child: const Text('Privacy Policy'),
          ),
        ],
      ),
      FilledButton(
        onPressed: busy ? null : _register,
        child: Text(busy ? 'Creating account…' : 'Sign up'),
      ),
    ],
  );
}

class ForgotScreen extends StatefulWidget {
  const ForgotScreen({super.key});
  @override
  State<ForgotScreen> createState() => _ForgotScreenState();
}

class _ForgotScreenState extends State<ForgotScreen> with _Submit {
  final _email = TextEditingController();
  String _done = '';

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _send() => submit(() async {
    final r = await AppScope.read(context).api
        .post('/auth/forgot', {'email': _email.text.trim()});
    if (mounted) setState(() => _done = '${r['message']}');
  });

  @override
  Widget build(BuildContext context) => _Shell(
    title: 'Forgot password',
    children: _done.isNotEmpty
        ? [Text(_done)]
        : [
            const Text(
              'Masukkan email akunmu. Kami kirim link untuk membuat password baru.',
            ),
            const SizedBox(height: 16),
            _Field(
              'Email',
              _email,
              keyboard: TextInputType.emailAddress,
              hints: const [AutofillHints.email],
              onSubmitted: _send,
            ),
            ErrorBox(error),
            FilledButton(
              onPressed: busy ? null : _send,
              child: Text(busy ? 'Sending…' : 'Send link'),
            ),
          ],
  );
}
