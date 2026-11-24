import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../format.dart';
import '../theme.dart';

void toast(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}

String errorText(Object e) =>
    e is ApiException ? e.message : 'Terjadi kesalahan. Coba lagi.';

/// Buka tautan di peramban; hanya http(s).
Future<void> openLink(BuildContext context, String url) async {
  final u = Uri.tryParse(url);
  var ok = false;
  if (u != null && (u.isScheme('http') || u.isScheme('https'))) {
    try {
      ok = await launchUrl(u, mode: LaunchMode.externalApplication);
    } catch (_) {}
  }
  if (!ok && context.mounted) toast(context, 'Tautan tidak bisa dibuka.');
}

class Panel extends StatelessWidget {
  const Panel({
    super.key,
    required this.child,
    this.onTap,
    this.padding = const EdgeInsets.all(16),
  });
  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final c = Lu.of(context);
    return Material(
      color: c.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: c.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(padding: padding, child: child),
      ),
    );
  }
}

class Loading extends StatelessWidget {
  const Loading({super.key});

  @override
  Widget build(BuildContext context) => const Center(
    child: Padding(
      padding: EdgeInsets.all(32),
      child: CircularProgressIndicator(
        color: Lu.lantern,
        semanticsLabel: 'Memuat',
      ),
    ),
  );
}

class Empty extends StatelessWidget {
  const Empty({super.key, required this.title, this.body, this.action});
  final String title;
  final String? body;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          title,
          textAlign: TextAlign.center,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
        ),
        if (body != null) ...[
          const SizedBox(height: 6),
          Text(
            body!,
            textAlign: TextAlign.center,
            style: TextStyle(color: Lu.of(context).inkMute),
          ),
        ],
        if (action != null) ...[const SizedBox(height: 16), action!],
      ],
    ),
  );
}

class ErrorRetry extends StatelessWidget {
  const ErrorRetry({super.key, required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Empty(
    title: 'Something went wrong',
    body: message,
    action: OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
  );
}

class ErrorBox extends StatelessWidget {
  const ErrorBox(this.message, {super.key});
  final String message;

  @override
  Widget build(BuildContext context) {
    if (message.isEmpty) return const SizedBox.shrink();
    final c = Lu.of(context);
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: c.danger.withValues(alpha: .1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(message, style: TextStyle(color: c.danger)),
    );
  }
}

class Avatar extends StatelessWidget {
  const Avatar(this.user, {super.key, this.size = 36});
  final Json? user;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = Lu.of(context);
    final foto = text(user?['fotoProfil']);
    final huruf = Center(
      child: Text(
        displayName(user).characters.first.toUpperCase(),
        style: TextStyle(
          color: c.teal,
          fontWeight: FontWeight.w700,
          fontSize: size * .4,
        ),
      ),
    );
    return ExcludeSemantics(
      child: ClipOval(
        child: Container(
          width: size,
          height: size,
          color: c.tealSoft,
          child: foto.startsWith('http')
              ? Image.network(
                  foto,
                  fit: BoxFit.cover,
                  cacheWidth: (size * 3).round(),
                  errorBuilder: (_, _, _) => huruf,
                )
              : huruf,
        ),
      ),
    );
  }
}

class Stars extends StatelessWidget {
  const Stars(this.value, {super.key, this.size = 16});
  final num value;
  final double size;

  @override
  Widget build(BuildContext context) => Semantics(
    label: '$value dari 5 bintang',
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var n = 1; n <= 5; n++)
          Icon(
            value >= n - .25
                ? Icons.star_rounded
                : value >= n - .75
                ? Icons.star_half_rounded
                : Icons.star_rounded,
            size: size,
            color: value >= n - .75 ? Lu.lamp : Lu.of(context).line,
          ),
      ],
    ),
  );
}
