import 'dart:async';

import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../format.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/book.dart';
import '../widgets/ui.dart';

const _sorts = {
  'terbaru': 'Terbaru',
  'populer': 'Paling banyak dibaca',
  'rating': 'Rating tertinggi',
  'judul': 'Judul A–Z',
};

class LibraryScreen extends StatefulWidget {
  const LibraryScreen({super.key, this.category = ''});
  final String category;
  @override
  State<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends State<LibraryScreen> {
  final _search = TextEditingController();
  final _scroll = ScrollController();
  Timer? _debounce;

  late String _category = widget.category;
  String _q = '';
  String _sort = 'terbaru';
  List<Json> _categories = [];
  List<Json> _items = [];
  int _page = 0;
  int _pages = 1;
  int _total = 0;
  bool _loading = false;
  String _error = '';

  /// Balasan untuk pencarian lama diabaikan.
  int _request = 0;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.extentAfter < 800 && _error.isEmpty) _more();
    });
    _loadCategories();
    _reset();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _loadCategories() async {
    try {
      final r = await AppScope.read(context).api.get('/books/categories');
      if (mounted) setState(() => _categories = jsonList(r['categories']));
    } catch (_) {
      // Tanpa saringan kategori; daftar buku tetap tampil.
    }
  }

  Future<void> _reset() {
    _request++;
    setState(() {
      _items = [];
      _page = 0;
      _pages = 1;
      _total = 0;
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
        '/books',
        query: {
          'q': _q,
          'kategori': _category,
          'sort': _sort,
          'page': _page + 1,
          'limit': 24,
        },
      );
      if (!mounted || mine != _request) return;
      final seen = {for (final b in _items) b['_id']};
      setState(() {
        _items = [
          ..._items,
          for (final b in jsonList(r['items']))
            if (seen.add(b['_id'])) b,
        ];
        _page = (r['page'] as num).toInt();
        _pages = (r['pages'] as num).toInt();
        _total = (r['total'] as num).toInt();
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

  void _onSearch(String v) {
    _debounce?.cancel();
    setState(() {});
    _debounce = Timer(const Duration(milliseconds: 400), () {
      if (v.trim() == _q) return;
      _q = v.trim();
      _reset();
    });
  }

  void _pick(String name) {
    _category = name;
    _reset();
  }

  @override
  Widget build(BuildContext context) {
    final c = Lu.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Library'),
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
      body: RefreshIndicator(
        onRefresh: () => Future.wait([_loadCategories(), _reset()]),
        child: CustomScrollView(
          controller: _scroll,
          physics: const AlwaysScrollableScrollPhysics(),
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          slivers: [
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              sliver: SliverToBoxAdapter(
                child: TextField(
                  controller: _search,
                  onChanged: _onSearch,
                  textInputAction: TextInputAction.search,
                  decoration: InputDecoration(
                    hintText: 'Search title, author, publisher, or ISBN',
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
              ),
            ),
            SliverToBoxAdapter(
              child: SizedBox(
                height: 52,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  children: [
                    _chip('Semua kategori', ''),
                    // Kategori dari tautan tetap tampil walau daftarnya belum termuat.
                    if (_category.isNotEmpty &&
                        !_categories.any((k) => k['name'] == _category))
                      _chip(_category, _category),
                    for (final k in _categories)
                      _chip('${k['name']}', '${k['name']}'),
                  ],
                ),
              ),
            ),
            if (_page > 0)
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 14),
                sliver: SliverToBoxAdapter(
                  child: Text(
                    '$_total buku',
                    style: TextStyle(color: c.inkMute),
                  ),
                ),
              ),
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              sliver: SliverLayoutBuilder(
                builder: (context, box) => SliverGrid.builder(
                  gridDelegate: bookGrid(context, box.crossAxisExtent),
                  itemCount: _items.length,
                  itemBuilder: (_, i) => BookCard(_items[i]),
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: _error.isNotEmpty
                  ? ErrorRetry(message: _error, onRetry: _more)
                  : _loading
                  ? const Loading()
                  : _items.isEmpty
                  ? const Empty(
                      title: 'No books found',
                      body: 'Coba kata kunci lain atau pilih kategori yang berbeda.',
                    )
                  : const SizedBox(height: 32),
            ),
          ],
        ),
      ),
    );
  }

  Widget _chip(String label, String value) => Padding(
    padding: const EdgeInsets.only(right: 8),
    child: ChoiceChip(
      label: Text(label),
      showCheckmark: false,
      selected: _category == value,
      onSelected: (_) => _pick(value),
    ),
  );
}
