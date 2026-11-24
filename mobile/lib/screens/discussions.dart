import 'dart:async';

import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../format.dart';
import '../nav.dart';
import '../state.dart';
import '../widgets/post.dart';
import '../widgets/ui.dart';
import 'discussion_detail.dart';
import 'discussion_form.dart';

const _sorts = {'aktif': 'Aktif', 'terbaru': 'Terbaru', 'hot': 'Hot Topic'};

/// Tulis diskusi baru, lalu buka hasilnya. true = jadi diposting.
Future<bool> startDiscussion(BuildContext context, {Json? book}) async {
  if (!await requireLogin(context) || !context.mounted) return false;
  final id = await push<String>(context, DiscussionFormScreen(book: book));
  if (id == null || !context.mounted) return id != null;
  await push<void>(context, DiscussionDetailScreen(id: id));
  return true;
}

class DiscussionsScreen extends StatefulWidget {
  const DiscussionsScreen({super.key});
  @override
  State<DiscussionsScreen> createState() => _DiscussionsScreenState();
}

class _DiscussionsScreenState extends State<DiscussionsScreen> {
  final _search = TextEditingController();
  final _scroll = ScrollController();
  Timer? _debounce;
  String _q = '';
  String _sort = 'aktif';
  List<Json> _items = [];
  int _page = 0;
  int _pages = 1;
  bool _loading = false;
  String _error = '';
  int _request = 0;
  bool? _signedIn;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.extentAfter < 600 && _error.isEmpty) _more();
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Suka & repost milik akun.
    final now = AppScope.of(context).signedIn;
    if (now != _signedIn) {
      _signedIn = now;
      _reset();
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _reset() {
    _request++;
    setState(() {
      _items = [];
      _page = 0;
      _pages = 1;
      _loading = false;
      _error = '';
    });
    return _more();
  }

  Future<void> _more() async {
    if (_loading || _page >= _pages) return;
    final mine = _request;
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final r = await AppScope.read(context).api.get(
        '/discussions',
        query: {'sort': _sort, 'q': _q, 'page': _page + 1},
      );
      if (!mounted || mine != _request) return;
      final seen = {for (final p in _items) p['_id']};
      setState(() {
        _items = [
          ..._items,
          for (final p in jsonList(r['items']))
            if (seen.add(p['_id'])) p,
        ];
        _page = (r['page'] as num).toInt();
        _pages = (r['pages'] as num).toInt();
        _loading = false;
      });
    } catch (e) {
      if (!mounted || mine != _request) return;
      setState(() {
        _loading = false;
        _error = errorText(e);
      });
    }
  }

  void _patch(Object? id, Json patch) {
    if (!mounted) return;
    setState(
      () => _items = [
        for (final p in _items) p['_id'] == id ? {...p, ...patch} : p,
      ],
    );
  }

  void _onSearch(String v) {
    _debounce?.cancel();
    setState(() {});
    _debounce = Timer(const Duration(milliseconds: 400), () {
      if (v.trim() == _q) return;
      _q = v.trim();
      _reset();
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Discussion'),
      actions: [
        PopupMenuButton<String>(
          tooltip: 'Sort',
          icon: const Icon(Icons.sort),
          initialValue: _sort,
          onSelected: (v) {
            _sort = v;
            _reset();
          },
          itemBuilder: (_) => [
            for (final e in _sorts.entries)
              PopupMenuItem(value: e.key, child: Text(e.value)),
          ],
        ),
      ],
    ),
    floatingActionButton: FloatingActionButton.extended(
      heroTag: 'diskusi-baru',
      icon: const Icon(Icons.edit_outlined),
      label: const Text('Start discussion'),
      onPressed: () async {
        if (await startDiscussion(context) && mounted) unawaited(_reset());
      },
    ),
    body: RefreshIndicator(
      onRefresh: _reset,
      child: ListView(
        controller: _scroll,
        physics: const AlwaysScrollableScrollPhysics(),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 96),
        children: [
          TextField(
            controller: _search,
            onChanged: _onSearch,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: 'Search discussions',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: _search.text.isEmpty
                  ? null
                  : IconButton(
                      tooltip: 'Clear',
                      icon: const Icon(Icons.close),
                      onPressed: () {
                        _search.clear();
                        _onSearch('');
                      },
                    ),
            ),
          ),
          const SizedBox(height: 14),
          for (final p in _items)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: PostCard(
                key: ValueKey(p['_id']),
                post: p,
                onChange: (patch) => _patch(p['_id'], patch),
                onReturn: () => _refreshOne('${p['_id']}'),
              ),
            ),
          if (_error.isNotEmpty)
            ErrorRetry(message: _error, onRetry: _more)
          else if (_loading)
            const Loading()
          else if (_items.isEmpty)
            Empty(
              title: _q.isEmpty
                  ? 'No discussions yet'
                  : 'No matching discussions',
              body: _q.isEmpty
                  ? 'Mulai dengan pertanyaan tentang buku yang sedang kamu baca.'
                  : 'Coba kata kunci lain.',
            ),
        ],
      ),
    ),
  );

  /// Hitungan setelah kembali dari detail; yang sudah dihapus dibuang.
  Future<void> _refreshOne(String id) async {
    try {
      final r = await AppScope.read(context).api.get('/discussions/$id');
      final d = r['discussion'] as Json;
      _patch(id, {
        for (final k in const [
          'judul',
          'cover',
          'likeCount',
          'likedByMe',
          'repostCount',
          'repostedByMe',
          'balasanCount',
        ])
          k: d[k],
      });
    } on ApiException catch (e) {
      if (e.status == 404 && mounted) {
        setState(
          () => _items = [
            for (final p in _items)
              if (p['_id'] != id) p,
          ],
        );
      }
    }
  }
}
