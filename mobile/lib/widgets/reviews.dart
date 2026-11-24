import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../format.dart';
import '../nav.dart';
import '../state.dart';
import '../theme.dart';
import 'report.dart';
import 'ui.dart';

const _labels = [
  'Pilih bintang',
  'Kurang',
  'Cukup',
  'Bagus',
  'Sangat bagus',
  'Luar biasa',
];

class Reviews extends StatefulWidget {
  const Reviews({super.key, required this.book, required this.onRating});
  final Json book;
  final void Function(num avg, num count) onRating;
  @override
  State<Reviews> createState() => _ReviewsState();
}

class _ReviewsState extends State<Reviews> {
  final _comment = TextEditingController();
  Json? _data;
  List<Json> _items = [];
  int _rating = 0;
  bool _editing = false;
  bool _busy = false;
  String _error = '';
  bool? _signedIn;

  ApiClient get _api => AppScope.read(context).api;
  String get _path => '/books/${widget.book['_id']}/reviews';
  Json? get _mine => _data?['mine'] as Json?;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final now = AppScope.of(context).signedIn;
    if (now != _signedIn) {
      _signedIn = now;
      _load();
    }
  }

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _load([int page = 1]) async {
    try {
      final r = await _api.get(_path, query: {'page': page});
      if (!mounted) return;
      setState(() {
        _data = r;
        _items = [if (page > 1) ..._items, ...jsonList(r['items'])];
        if (!_editing) {
          _rating = (_mine?['rating'] as num?)?.toInt() ?? 0;
          _comment.text = text(_mine?['komentar']);
        }
      });
    } catch (_) {
      // Bagian ulasan tidak ditampilkan; halaman bisa disegarkan.
    }
  }

  Future<void> _run(Future<void> Function() f) async {
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      await f();
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _submit() => _run(() async {
    if (_rating == 0) {
      setState(() => _error = 'Pilih jumlah bintang dulu.');
      return;
    }
    final r = await _api.put(_path, {
      'rating': _rating,
      'komentar': _comment.text.trim(),
    });
    if (!mounted) return;
    FocusScope.of(context).unfocus();
    _editing = false;
    widget.onRating(r['ratingAvg'] as num, r['ratingCount'] as num);
    toast(context, 'Ulasan tersimpan.');
    await _load();
  });

  Future<void> _delete() async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete review?'),
        content: const Text('Ulasan dan ratingnya akan dihapus.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (yes != true || !mounted) return;
    await _run(() async {
      await _api.delete('/reviews/${_mine!['_id']}');
      _editing = false;
      await _load();
      final d = _data;
      if (mounted && d != null) {
        widget.onRating(d['avg'] as num? ?? 0, d['count'] as num? ?? 0);
        toast(context, 'Ulasan dihapus.');
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final c = Lu.of(context);
    final d = _data;
    if (d == null) return const SizedBox.shrink();
    final count = (d['count'] as num? ?? 0).toInt();
    final uploader =
        s.isMe((widget.book['uploadedBy'] as Json?)?['_id']) && !s.isAdmin;
    final canWrite =
        s.signedIn && widget.book['status'] == 'disetujui' && !uploader;
    final page = (d['page'] as num? ?? 1).toInt();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Reviews', style: serifStyle(context, 20)),
        const SizedBox(height: 10),
        Row(
          children: [
            Text(
              count > 0 ? (d['avg'] as num).toStringAsFixed(1) : '–',
              style: serifStyle(context, 40),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final x in jsonList(d['distribution']))
                    Row(
                      children: [
                        SizedBox(width: 14, child: Text('${x['star']}')),
                        Expanded(
                          child: LinearProgressIndicator(
                            value: count > 0 ? (x['count'] as num) / count : 0,
                            minHeight: 7,
                            color: Lu.lamp,
                            backgroundColor: c.line,
                            borderRadius: BorderRadius.circular(4),
                          ),
                        ),
                        SizedBox(
                          width: 30,
                          child: Text(
                            '${x['count']}',
                            textAlign: TextAlign.right,
                          ),
                        ),
                      ],
                    ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        if (!s.signedIn)
          OutlinedButton(
            onPressed: () => requireLogin(context),
            child: const Text('Sign in untuk memberi ulasan'),
          ),
        if (uploader)
          Text(
            'Kamu pengunggah buku ini, jadi tidak bisa mengulasnya.',
            style: TextStyle(color: c.inkMute),
          ),
        if (canWrite && (_mine == null || _editing)) _form(context),
        if (_items.isEmpty)
          const Empty(
            title: 'No reviews yet',
            body: 'Sudah membaca buku ini? Tulis ulasan pertama.',
          ),
        for (final r in _items) _tile(context, r),
        if (page < (d['pages'] as num? ?? 1))
          TextButton(
            onPressed: () => _load(page + 1),
            child: const Text('More reviews'),
          ),
      ],
    );
  }

  Widget _form(BuildContext context) => Panel(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          _mine == null
              ? 'What did you think of this book?'
              : 'Edit your review',
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        Wrap(
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            for (var n = 1; n <= 5; n++)
              IconButton(
                tooltip: '$n ${n == 1 ? 'star' : 'stars'}',
                icon: Icon(
                  Icons.star_rounded,
                  size: 30,
                  color: n <= _rating ? Lu.lamp : Lu.of(context).line,
                ),
                onPressed: () => setState(() => _rating = n),
              ),
            Text(_labels[_rating]),
          ],
        ),
        TextField(
          controller: _comment,
          maxLength: 2000,
          minLines: 3,
          maxLines: 8,
          decoration: const InputDecoration(
            hintText: 'Ceritakan apa yang kamu dapat dari buku ini (opsional)',
          ),
        ),
        ErrorBox(_error),
        Row(
          children: [
            FilledButton(
              onPressed: _busy ? null : _submit,
              child: Text(_busy ? 'Saving…' : 'Submit review'),
            ),
            if (_editing)
              TextButton(
                onPressed: () => setState(() => _editing = false),
                child: const Text('Cancel'),
              ),
          ],
        ),
      ],
    ),
  );

  Widget _tile(BuildContext context, Json r) {
    final c = Lu.of(context);
    final user = r['user'] as Json?;
    final mine = _mine != null && r['_id'] == _mine!['_id'];
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Avatar(user),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  displayName(user),
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                Row(
                  children: [
                    Stars(r['rating'] as num? ?? 0, size: 14),
                    const SizedBox(width: 8),
                    Text(
                      timeAgo(r['updatedAt']),
                      style: TextStyle(fontSize: 12, color: c.inkMute),
                    ),
                  ],
                ),
                if (text(r['komentar']).isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      text(r['komentar']),
                      style: TextStyle(color: c.inkSoft, height: 1.5),
                    ),
                  ),
                if (mine)
                  Row(
                    children: [
                      TextButton(
                        onPressed: () => setState(() => _editing = true),
                        child: const Text('Edit'),
                      ),
                      TextButton(
                        onPressed: _busy ? null : _delete,
                        child: Text(
                          'Delete',
                          style: TextStyle(color: c.danger),
                        ),
                      ),
                    ],
                  )
                else
                  ReportButton(
                    type: 'review',
                    id: '${r['_id']}',
                    ownerId: user?['_id'],
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
