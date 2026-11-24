import 'dart:async';

import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../format.dart';
import '../state.dart';
import '../theme.dart';
import 'book.dart';
import 'ui.dart';

/// Baris kecil buku: sampul, judul, penulis.
class BookLine extends StatelessWidget {
  const BookLine(this.book, {super.key, this.onTap, this.trailing});
  final Json book;
  final VoidCallback? onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Panel(
    onTap: onTap,
    padding: const EdgeInsets.all(10),
    child: Row(
      children: [
        SizedBox(width: 36, child: BookCover(book)),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                text(book['judul']),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: serifStyle(context, 14),
              ),
              Text(
                text(book['penulis']),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 12, color: Lu.of(context).inkMute),
              ),
            ],
          ),
        ),
        ?trailing,
      ],
    ),
  );
}

Future<Json?> pickBook(BuildContext context) => showModalBottomSheet<Json>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  showDragHandle: true,
  builder: (_) =>
      const FractionallySizedBox(heightFactor: .85, child: _BookPicker()),
);

class _BookPicker extends StatefulWidget {
  const _BookPicker();
  @override
  State<_BookPicker> createState() => _BookPickerState();
}

class _BookPickerState extends State<_BookPicker> {
  Timer? _debounce;
  List<Json>? _items;
  String _error = '';
  String _q = '';
  int _request = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final mine = ++_request;
    try {
      final r = await AppScope.read(context).api
          .get('/books', query: {'limit': 24, 'q': _q});
      if (!mounted || mine != _request) return;
      setState(() {
        _items = jsonList(r['items']);
        _error = '';
      });
    } catch (e) {
      if (mounted && mine == _request) setState(() => _error = errorText(e));
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(
      16,
      0,
      16,
      MediaQuery.viewInsetsOf(context).bottom,
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Choose a book', style: serifStyle(context, 20)),
        const SizedBox(height: 10),
        TextField(
          decoration: const InputDecoration(
            hintText: 'Search title or author',
            prefixIcon: Icon(Icons.search),
          ),
          onChanged: (v) {
            _debounce?.cancel();
            _debounce = Timer(const Duration(milliseconds: 350), () {
              _q = v.trim();
              _load();
            });
          },
        ),
        const SizedBox(height: 10),
        Expanded(
          child: _error.isNotEmpty
              ? ErrorRetry(message: _error, onRetry: _load)
              : _items == null
              ? const Loading()
              : _items!.isEmpty
              ? const Empty(title: 'No books found')
              : ListView.separated(
                  itemCount: _items!.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (context, i) => BookLine(
                    _items![i],
                    onTap: () => Navigator.pop(context, _items![i]),
                  ),
                ),
        ),
      ],
    ),
  );
}
