import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:material_ui/material_ui.dart';

import '../theme.dart';
import 'ui.dart';

/// Markdown dari pengguna / LUMA. Tautan dibuka di peramban; gambar hanya https.
class Md extends StatelessWidget {
  const Md(this.data, {super.key, this.selectable = true});
  final String data;
  final bool selectable;

  @override
  Widget build(BuildContext context) {
    final c = Lu.of(context);
    // Teks yang bisa disorot tidak mewarisi huruf tema.
    const font = 'Manrope';
    final p = TextStyle(
      fontFamily: font,
      fontSize: 15,
      height: 1.6,
      color: c.ink,
    );
    TextStyle h(double size) => TextStyle(
      fontFamily: font,
      fontSize: size,
      fontWeight: FontWeight.w700,
      color: c.ink,
    );
    return MarkdownBody(
      data: data,
      selectable: selectable,
      onTapLink: (_, href, _) {
        if (href != null) openLink(context, href);
      },
      imageBuilder: (uri, _, alt) => uri.isScheme('https')
          ? Image.network('$uri', errorBuilder: (_, _, _) => Text(alt ?? ''))
          : Text(alt ?? ''),
      styleSheet: MarkdownStyleSheet(
        p: p,
        listBullet: p,
        a: TextStyle(
          fontFamily: font,
          color: c.teal,
          decoration: TextDecoration.underline,
        ),
        h1: h(20),
        h2: h(18),
        h3: h(16),
        h4: h(15),
        code: TextStyle(
          fontFamily: 'monospace',
          fontSize: 13,
          color: c.ink,
          backgroundColor: c.mist,
        ),
        codeblockDecoration: BoxDecoration(
          color: c.mist,
          borderRadius: BorderRadius.circular(8),
        ),
        blockquoteDecoration: BoxDecoration(
          color: c.mist,
          border: Border(left: BorderSide(color: c.teal, width: 3)),
        ),
        tableBorder: TableBorder.all(color: c.line),
        tableColumnWidth: const IntrinsicColumnWidth(),
      ),
    );
  }
}
