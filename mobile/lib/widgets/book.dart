import 'dart:math' as math;

import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../format.dart';
import '../nav.dart';
import '../screens/book_detail.dart';
import '../theme.dart';
import 'ui.dart';

const _tones = [
  (Color(0xFF143752), Color(0xFFFFC93C)),
  (Color(0xFF316B6C), Color(0xFFFFF1DE)),
  (Color(0xFF1F4D4E), Color(0xFFFFC93C)),
  (Color(0xFF3E5A72), Color(0xFFFFFFFF)),
  (Color(0xFF7A3E12), Color(0xFFFFE3B8)),
];

/// Sampul buku; tanpa gambar (atau gagal dimuat) dibuat sampul tipografi dari judul.
class BookCover extends StatelessWidget {
  const BookCover(this.book, {super.key, this.large = false});
  final Json book;
  final bool large;

  @override
  Widget build(BuildContext context) {
    final judul = text(book['judul']);
    var h = 0;
    for (final u in judul.codeUnits) {
      h = (h * 31 + u) & 0xffffffff;
    }
    final (bg, fg) = _tones[h % _tones.length];
    final cover = text(book['cover']);
    final tipografi = Container(
      color: bg,
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(height: 1, width: 36, color: fg.withValues(alpha: .6)),
          const SizedBox(height: 10),
          Expanded(
            child: Text(
              judul,
              overflow: TextOverflow.fade,
              style: TextStyle(
                fontFamily: serif,
                fontWeight: FontWeight.w600,
                fontSize: large ? 20 : 13,
                height: 1.25,
                color: fg,
              ),
            ),
          ),
          Text(
            text(book['penulis']),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: large ? 13 : 10, color: fg),
          ),
        ],
      ),
    );
    return Semantics(
      image: true,
      label: 'Sampul $judul',
      excludeSemantics: true,
      child: AspectRatio(
        aspectRatio: 2 / 3,
        child: DecoratedBox(
          decoration: const BoxDecoration(
            boxShadow: [
              BoxShadow(
                color: Color(0x38143752),
                blurRadius: 14,
                offset: Offset(0, 6),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: const BorderRadius.horizontal(
              left: Radius.circular(3),
              right: Radius.circular(6),
            ),
            child: cover.startsWith('http')
                ? ColoredBox(
                    color: Lu.of(context).line,
                    child: Image.network(
                      cover,
                      fit: BoxFit.cover,
                      cacheWidth: large ? 600 : 400,
                      errorBuilder: (_, _, _) => tipografi,
                    ),
                  )
                : tipografi,
          ),
        ),
      ),
    );
  }
}

class BookCard extends StatelessWidget {
  const BookCard(this.book, {super.key});
  final Json book;

  @override
  Widget build(BuildContext context) {
    final c = Lu.of(context);
    return InkWell(
      onTap: () => push<void>(context, BookDetailScreen(id: '${book['_id']}')),
      borderRadius: BorderRadius.circular(6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          BookCover(book),
          const SizedBox(height: 10),
          Text(
            text(book['judul']),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: serifStyle(context, 14),
          ),
          const SizedBox(height: 2),
          Text(
            text(book['penulis']),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 12, color: c.inkMute),
          ),
          if ((book['ratingCount'] as num? ?? 0) > 0)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Stars(book['ratingAvg'] as num? ?? 0, size: 13),
            ),
        ],
      ),
    );
  }
}

/// Susunan kisi: tinggi sel = sampul 2:3 + teks (ikut ukuran huruf perangkat).
SliverGridDelegate bookGrid(BuildContext context, double width) {
  final columns = math.max(2, (width / 180).floor());
  const gap = 18.0;
  final cell = (width - gap * (columns - 1)) / columns;
  final scale = MediaQuery.textScalerOf(context).scale(14) / 14;
  return SliverGridDelegateWithFixedCrossAxisCount(
    crossAxisCount: columns,
    crossAxisSpacing: gap,
    mainAxisSpacing: 22,
    mainAxisExtent: cell * 1.5 + 14 + 74 * scale,
  );
}
