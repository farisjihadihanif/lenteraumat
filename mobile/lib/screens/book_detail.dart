import 'package:material_ui/material_ui.dart';
import 'package:share_plus/share_plus.dart';

import '../api.dart';
import '../config.dart';
import '../format.dart';
import '../nav.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/book.dart';
import '../widgets/report.dart';
import '../widgets/reviews.dart';
import '../widgets/ui.dart';
import 'library.dart';
import 'reader.dart';

class BookDetailScreen extends StatefulWidget {
  const BookDetailScreen({super.key, required this.id});
  final String id;
  @override
  State<BookDetailScreen> createState() => _BookDetailScreenState();
}

class _BookDetailScreenState extends State<BookDetailScreen> {
  Json? _book;
  String _error = '';
  bool _notFound = false;
  List<Json>? _discussions;
  bool _saving = false;
  bool? _signedIn;

  /// Muatan yang dimulai sebelum Save selesai tidak boleh menimpa hasilnya.
  int _saves = 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Muat ulang setelah masuk / keluar: status "Saved" milik akun.
    final now = AppScope.of(context).signedIn;
    if (now != _signedIn) {
      _signedIn = now;
      _load();
    }
  }

  Future<void> _load() async {
    final api = AppScope.read(context).api;
    final saves = _saves;
    try {
      final r = await api.get('/books/${widget.id}');
      if (!mounted || saves != _saves) return;
      setState(() {
        _book = r['book'] as Json;
        _error = '';
        _notFound = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = errorText(e);
        _notFound = e is ApiException && e.status == 404;
      });
      return;
    }
    try {
      final r = await api.get(
        '/discussions',
        query: {'book': widget.id, 'limit': 5, 'sort': 'aktif'},
      );
      if (mounted) setState(() => _discussions = jsonList(r['items']));
    } catch (_) {
      // Bagian diskusi tidak ditampilkan.
    }
  }

  Future<void> _toggleSave() async {
    if (_saving || !await requireLogin(context) || !mounted) return;
    _saves++;
    setState(() => _saving = true);
    try {
      final r = await AppScope.read(context).api
          .post('/books/${widget.id}/save');
      if (!mounted) return;
      final saved = r['saved'] == true;
      _saves++;
      setState(() {
        final n = (_book!['savedCount'] as num? ?? 0) + (saved ? 1 : -1);
        _book = {..._book!, 'saved': saved, 'savedCount': n < 0 ? 0 : n};
      });
      toast(context, saved ? 'Disimpan ke rak.' : 'Dihapus dari rak.');
    } catch (e) {
      if (mounted) toast(context, errorText(e));
    }
    if (mounted) setState(() => _saving = false);
  }

  void _share() => SharePlus.instance.share(
    ShareParams(
      subject: text(_book!['judul']),
      text: '${_book!['judul']}\n$webBase/buku/${widget.id}',
    ),
  );

  @override
  Widget build(BuildContext context) {
    final b = _book;
    return Scaffold(
      appBar: AppBar(
        actions: [
          if (b != null)
            IconButton(
              tooltip: 'Share',
              icon: const Icon(Icons.share_outlined),
              onPressed: _share,
            ),
        ],
      ),
      body: b == null
          ? _error.isEmpty
                ? const Loading()
                : _notFound
                ? Empty(title: 'Book not found', body: _error)
                : ErrorRetry(message: _error, onRetry: _load)
          : RefreshIndicator(onRefresh: _load, child: _body(context, b)),
    );
  }

  Widget _body(BuildContext context, Json b) {
    final c = Lu.of(context);
    final mute = TextStyle(color: c.inkMute, fontSize: 13);
    final rated = (b['ratingCount'] as num? ?? 0) > 0;
    final size = (b['file'] as Json?)?['size'] as num? ?? 0;
    final saved = b['saved'] == true;
    final meta = [
      ('Penerbit', text(b['penerbit'])),
      ('Tahun terbit', text(b['tahunTerbit'])),
      ('Edisi', text(b['edisi'])),
      ('ISBN', text(b['isbn'])),
      ('Bahasa', text(b['bahasa'])),
      ('Halaman', (b['halaman'] as num? ?? 0) > 0 ? text(b['halaman']) : ''),
      ('Ukuran file', size > 0 ? formatSize(size) : ''),
      ('Ditambahkan', formatDate(b['createdAt'])),
    ].where((e) => e.$2.isNotEmpty);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 40),
      children: [
        if (b['status'] != 'disetujui') _pending(context, b),
        Center(child: SizedBox(width: 180, child: BookCover(b, large: true))),
        const SizedBox(height: 20),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton(
            style: TextButton.styleFrom(
              padding: EdgeInsets.zero,
              minimumSize: const Size(0, 48),
            ),
            onPressed: () => push<void>(
              context,
              LibraryScreen(category: text(b['kategori'])),
            ),
            child: Text(text(b['kategori'])),
          ),
        ),
        Text(text(b['judul']), style: serifStyle(context, 26)),
        const SizedBox(height: 6),
        Text(
          text(b['penulis']),
          style: TextStyle(fontSize: 16, color: c.inkSoft),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 14,
          runSpacing: 4,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            if (rated)
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Stars(b['ratingAvg'] as num),
                  Text(
                    ' ${(b['ratingAvg'] as num).toStringAsFixed(1)} (${b['ratingCount']} ulasan)',
                    style: mute,
                  ),
                ],
              )
            else
              Text('Belum ada ulasan', style: mute),
            Text('${b['dibaca'] ?? 0} kali dibaca', style: mute),
            Text('${b['savedCount'] ?? 0} disimpan', style: mute),
          ],
        ),
        const SizedBox(height: 18),
        FilledButton.icon(
          icon: const Icon(Icons.auto_stories_outlined),
          label: const Text('Read book'),
          onPressed: () => push<void>(context, ReaderScreen(book: b)),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                icon: Icon(
                  saved ? Icons.bookmark_added : Icons.bookmark_border,
                  color: saved ? c.teal : null,
                ),
                label: Text(saved ? 'Saved' : 'Save'),
                onPressed: _saving ? null : _toggleSave,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton.icon(
                icon: Icon(Icons.auto_awesome, color: c.lanternText),
                label: const Text('Ask LUMA'),
                onPressed: () => openTab(context, tabLuma),
              ),
            ),
          ],
        ),
        if (text(b['deskripsi']).isNotEmpty) ...[
          const SizedBox(height: 20),
          Text(
            text(b['deskripsi']),
            style: TextStyle(color: c.inkSoft, height: 1.6),
          ),
        ],
        const SizedBox(height: 20),
        for (final (k, v) in meta) _row(context, k, Text(v, style: _bold)),
        _source(context, b),
        const SizedBox(height: 12),
        Row(
          children: [
            Avatar(b['uploadedBy'] as Json?, size: 24),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                'Diunggah oleh ${displayName(b['uploadedBy'] as Json?)}',
                style: mute,
              ),
            ),
            ReportButton(
              type: 'book',
              id: widget.id,
              ownerId: (b['uploadedBy'] as Json?)?['_id'],
            ),
          ],
        ),
        const SizedBox(height: 28),
        Reviews(
          book: b,
          onRating: (avg, count) => setState(
            () => _book = {..._book!, 'ratingAvg': avg, 'ratingCount': count},
          ),
        ),
        if (b['status'] == 'disetujui' && _discussions != null)
          _related(context, _discussions!),
      ],
    );
  }

  static const _bold = TextStyle(fontWeight: FontWeight.w600, fontSize: 14);

  Widget _row(BuildContext context, String k, Widget v) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 5),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 112,
          child: Text(
            k,
            style: TextStyle(color: Lu.of(context).inkMute, fontSize: 14),
          ),
        ),
        Expanded(child: v),
      ],
    ),
  );

  Widget _pending(BuildContext context, Json b) => Padding(
    padding: const EdgeInsets.only(bottom: 20),
    child: Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(statusLabel[b['status']] ?? '', style: _bold),
          const SizedBox(height: 4),
          const Text(
            'Buku ini hanya terlihat olehmu dan admin sampai disetujui.',
          ),
          if (text(b['catatanReview']).isNotEmpty)
            Text('Catatan admin: ${b['catatanReview']}'),
        ],
      ),
    ),
  );

  Widget _source(BuildContext context, Json b) {
    Widget link(String label, String url) => url.isEmpty
        ? Text(label, style: _bold)
        : InkWell(
            onTap: () => openLink(context, url),
            child: Text(
              label,
              style: _bold.copyWith(
                color: Lu.of(context).teal,
                decoration: TextDecoration.underline,
              ),
            ),
          );
    final sumber = text(b['sumber']), sumberUrl = text(b['sumberUrl']);
    final lisensi = text(b['lisensi']);
    final sitasi = text(b['sitasi']);
    if (sumber.isEmpty &&
        sumberUrl.isEmpty &&
        lisensi.isEmpty &&
        sitasi.isEmpty) {
      return const SizedBox.shrink();
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 18),
        Text('Source & license', style: serifStyle(context, 18)),
        const SizedBox(height: 6),
        if (sumber.isNotEmpty || sumberUrl.isNotEmpty)
          _row(
            context,
            'Sumber',
            link(sumber.isEmpty ? sumberUrl : sumber, sumberUrl),
          ),
        if (lisensi.isNotEmpty)
          _row(context, 'Lisensi', link(lisensi, text(b['lisensiUrl']))),
        if (sitasi.isNotEmpty)
          _row(
            context,
            'Sitasi',
            SelectableText(sitasi, style: const TextStyle(fontSize: 14)),
          ),
      ],
    );
  }

  Widget _related(BuildContext context, List<Json> items) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const SizedBox(height: 28),
      Text('Discussions about this book', style: serifStyle(context, 20)),
      const SizedBox(height: 12),
      if (items.isEmpty)
        Text(
          'Belum ada diskusi. Punya pertanyaan atau catatan tentang buku ini? Ajak pembaca lain berdiskusi.',
          style: TextStyle(color: Lu.of(context).inkMute),
        ),
      for (final d in items)
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Panel(
            // Layar detail diskusi menyusul; sementara membuka tab Discussions.
            onTap: () => openTab(context, tabDiscussions),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(text(d['judul']), style: _bold),
                const SizedBox(height: 4),
                Text(
                  '${displayName(d['author'] as Json?)} · ${timeAgo(d['lastActivityAt'])} · ${d['balasanCount'] ?? 0} balasan',
                  style: TextStyle(fontSize: 12, color: Lu.of(context).inkMute),
                ),
              ],
            ),
          ),
        ),
    ],
  );
}
