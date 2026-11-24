import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../format.dart';
import '../nav.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/book.dart';
import '../widgets/ui.dart';
import 'book_detail.dart';
import 'reader.dart';
import 'upload_book.dart';

class ShelfScreen extends StatelessWidget {
  const ShelfScreen({super.key, this.initial = 0});
  final int initial;

  @override
  Widget build(BuildContext context) => DefaultTabController(
    length: 3,
    initialIndex: initial,
    child: Scaffold(
      appBar: AppBar(
        title: const Text('My Shelf'),
        bottom: const TabBar(
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          tabs: [
            Tab(text: 'Continue reading'),
            Tab(text: 'Saved'),
            Tab(text: 'My uploads'),
          ],
        ),
      ),
      body: const TabBarView(
        children: [
          _Section('/books/continue'),
          _Section('/books/saved'),
          _Section('/books/mine'),
        ],
      ),
    ),
  );
}

class _Section extends StatefulWidget {
  const _Section(this.path);
  final String path;
  @override
  State<_Section> createState() => _SectionState();
}

class _SectionState extends State<_Section>
    with AutomaticKeepAliveClientMixin {
  List<Json>? _items;
  String _error = '';

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await AppScope.read(context).api.get(widget.path);
      if (mounted) {
        setState(() {
          _items = jsonList(r['items']);
          _error = '';
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
  }

  Future<void> _go(Widget screen) async {
    await push<void>(context, screen);
    if (mounted) await _load();
  }

  /// "Lanjut membaca" butuh detail lengkap (alamat & ukuran berkas).
  Future<void> _read(Json book) async {
    try {
      final r = await AppScope.read(context).api.get('/books/${book['_id']}');
      if (mounted) await _go(ReaderScreen(book: r['book'] as Json));
    } catch (e) {
      if (mounted) toast(context, errorText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final items = _items;
    if (_error.isNotEmpty && items == null) {
      return ErrorRetry(message: _error, onRetry: _load);
    }
    if (items == null) return const Loading();
    return RefreshIndicator(
      onRefresh: _load,
      child: LayoutBuilder(
        builder: (context, box) => items.isEmpty
            ? ListView(children: [_empty(context)])
            : widget.path.endsWith('saved')
            ? GridView.builder(
                padding: const EdgeInsets.all(16),
                physics: const AlwaysScrollableScrollPhysics(),
                gridDelegate: bookGrid(context, box.maxWidth - 32),
                itemCount: items.length,
                itemBuilder: (_, i) => BookCard(items[i]),
              )
            : ListView.separated(
                padding: const EdgeInsets.all(16),
                physics: const AlwaysScrollableScrollPhysics(),
                itemCount: items.length,
                separatorBuilder: (_, _) => const SizedBox(height: 10),
                itemBuilder: (context, i) => widget.path.endsWith('mine')
                    ? _upload(context, items[i])
                    : _continue(context, items[i]),
              ),
      ),
    );
  }

  Widget _empty(BuildContext context) => switch (widget.path) {
    '/books/continue' => const Empty(
      title: 'No books read yet',
      body:
          'Buku yang kamu buka akan muncul di sini beserta halaman terakhirnya.',
    ),
    '/books/saved' => const Empty(
      title: 'No saved books yet',
      body: 'Tekan tombol Save di halaman buku untuk menaruhnya di rakmu.',
    ),
    _ => Empty(
      title: "You haven't uploaded any books",
      body: 'Buku yang kamu unggah akan ditinjau admin sebelum tayang.',
      action: FilledButton(
        onPressed: () => _go(const UploadBookScreen()),
        child: const Text('Upload book'),
      ),
    ),
  };

  Widget _line(
    BuildContext context,
    Json book,
    List<Widget> more,
    VoidCallback onTap,
  ) => Panel(
    onTap: onTap,
    padding: const EdgeInsets.all(12),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(width: 58, child: BookCover(book)),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                text(book['judul']),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: serifStyle(context, 15),
              ),
              ...more,
            ],
          ),
        ),
      ],
    ),
  );

  Widget _continue(BuildContext context, Json x) {
    final page = x['page'] as num? ?? 1;
    final total = x['totalPages'] as num? ?? 0;
    final book = x['book'] as Json;
    final c = Lu.of(context);
    return _line(context, book, [
      const SizedBox(height: 4),
      Text(
        'Halaman $page${total > 0 ? ' dari $total' : ''} · ${timeAgo(x['updatedAt'])}',
        style: TextStyle(fontSize: 12, color: c.inkMute),
      ),
      const SizedBox(height: 10),
      LinearProgressIndicator(
        value: total > 0 ? (page / total).clamp(0, 1).toDouble() : .05,
        minHeight: 6,
        color: Lu.lantern,
        backgroundColor: c.mist,
        borderRadius: BorderRadius.circular(3),
      ),
    ], () => _read(book));
  }

  Widget _upload(BuildContext context, Json b) {
    final c = Lu.of(context);
    final status = text(b['status']);
    return _line(context, b, [
      const SizedBox(height: 4),
      Text(
        statusLabel[status] ?? status,
        style: TextStyle(
          fontWeight: FontWeight.w700,
          fontSize: 12,
          color: switch (status) {
            'disetujui' => c.teal,
            'ditolak' => c.danger,
            _ => c.lanternText,
          },
        ),
      ),
      Text(
        '${b['penulis']} · diperbarui ${timeAgo(b['updatedAt'])}',
        style: TextStyle(fontSize: 12, color: c.inkMute),
      ),
      if (text(b['catatanReview']).isNotEmpty && status != 'disetujui')
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text('Catatan admin: ${b['catatanReview']}'),
        ),
      if (status != 'disetujui')
        TextButton(
          onPressed: () => _go(UploadBookScreen(id: '${b['_id']}')),
          child: Text(status == 'menunggu' ? 'Edit' : 'Fix & resubmit'),
        ),
    ], () => _go(BookDetailScreen(id: '${b['_id']}')));
  }
}
