import 'dart:async';

import 'package:material_ui/material_ui.dart';
import 'package:pdfrx/pdfrx.dart';

import '../api.dart';
import '../format.dart';
import '../reader/book_source.dart';
import '../reader/progress.dart';
import '../state.dart';
import '../theme.dart';

class ReaderScreen extends StatefulWidget {
  const ReaderScreen({super.key, required this.book});

  /// Buku lengkap dari GET /books/:id.
  final Json book;
  @override
  State<ReaderScreen> createState() => _ReaderScreenState();
}

class _ReaderScreenState extends State<ReaderScreen> {
  late final AppState _state = AppScope.read(context);
  late final String _id = '${widget.book['_id']}';
  late final _progress = ReadingProgress(_state, _id);

  BookSource? _source;
  PdfDocumentRef? _ref;
  var _controller = PdfViewerController();
  int _attempt = 0;
  bool _ready = false;
  bool _counted = false;
  bool _bars = true;
  String _error = '';
  int _start = 1;
  int _page = 1;
  int _pages = 0;
  double? _drag;
  int? _unsaved;
  Timer? _save;

  @override
  void initState() {
    super.initState();
    _open();
  }

  @override
  void dispose() {
    _save?.cancel();
    if (_unsaved != null) unawaited(_progress.save(_unsaved!));
    _source?.close();
    super.dispose();
  }

  Future<void> _open() async {
    final mine = ++_attempt;
    _source?.close();
    final file = widget.book['file'] as Json?;
    final src = BookSource(
      id: _id,
      proxy: _state.api.uri('/books/$_id/file'),
      direct: text(file?['direct']),
      headers: _state.api.authHeaders,
      // Buku yang belum disetujui tidak disimpan di disk.
      cache: widget.book['status'] == 'disetujui' ? _state.cache : null,
    );
    setState(() {
      _source = src;
      _ref = null;
      _ready = false;
      _error = '';
    });
    try {
      final resume = _ready || _pages > 0
          ? Future.value(_page)
          : _progress.load();
      await src.open(sizeHint: (file?['size'] as num?)?.toInt() ?? 0);
      final start = await resume;
      if (!mounted || mine != _attempt) return;
      setState(() {
        _start = _page = start < 1 ? 1 : start;
        _controller = PdfViewerController();
        // Progresif: cukup halaman yang dibuka, bukan seluruh buku.
        _ref = PdfDocumentRefCustom(
          fileSize: src.total,
          read: src.read,
          sourceName: '$_id#$mine',
          maxSizeToCacheOnMemory: 0,
          useProgressiveLoading: true,
        );
      });
    } catch (e) {
      if (mounted && mine == _attempt) _fail(e);
    }
  }

  void _fail(Object e) {
    if (_error.isNotEmpty) return;
    setState(
      () => _error = e is BookSourceException
          ? e.message
          : 'Buku tidak bisa dibuka. Coba lagi.',
    );
  }

  /// Halaman pertama sudah tampil: hitung bacaan, lalu unduh sisanya di latar.
  void _onLoaded(int attempt, bool ok) {
    if (!mounted || attempt != _attempt) return;
    if (!ok) return _fail('gagal');
    if (_ready) return;
    setState(() => _ready = true);
    if (!_counted) {
      _counted = true;
      _state.api.post('/books/$_id/read').ignore();
    }
    unawaited(_source!.prefetch(from: _pages > 1 ? _page / _pages : 0));
  }

  void _onPage(int? n) {
    if (!mounted || n == null || n == _page) return;
    setState(() => _page = n);
    _unsaved = n;
    _save?.cancel();
    _save = Timer(const Duration(milliseconds: 1200), () {
      _unsaved = null;
      _progress.save(n);
    });
  }

  Future<void> _askPage() async {
    final input = TextEditingController(text: '$_page');
    final n = await showDialog<int>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Go to page'),
        content: TextField(
          controller: input,
          autofocus: true,
          keyboardType: TextInputType.number,
          decoration: InputDecoration(hintText: '1–$_pages'),
          onSubmitted: (v) => Navigator.pop(context, int.tryParse(v)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, int.tryParse(input.text)),
            child: const Text('Go'),
          ),
        ],
      ),
    );
    if (n != null && mounted) _goTo(n);
  }

  void _goTo(int n) {
    if (_controller.isReady) {
      _controller.goToPage(pageNumber: n.clamp(1, _pages));
    }
  }

  @override
  Widget build(BuildContext context) {
    final ref = _ref;
    return Scaffold(
      backgroundColor: const Color(0xFF0B141D),
      body: Stack(
        fit: StackFit.expand,
        children: [
          if (ref != null && _error.isEmpty) _viewer(ref, _attempt),
          if (!_ready && _error.isEmpty)
            ReaderLoading(
              source: _source!,
              onClose: () => Navigator.pop(context),
            ),
          if (_error.isNotEmpty) _errorView(),
          if (_ready && _error.isEmpty && _bars) ...[_topBar(), _bottomBar()],
        ],
      ),
    );
  }

  Widget _viewer(PdfDocumentRef ref, int attempt) => PdfViewer(
    ref,
    key: ValueKey(attempt),
    controller: _controller,
    initialPageNumber: _start,
    params: PdfViewerParams(
      backgroundColor: const Color(0xFF0B141D),
      layoutStrategy: const SequentialPagesLayout(
        scrollDirection: Axis.horizontal,
        fitMode: PdfFitMode.fit,
      ),
      paging: const PdfPaging(),
      // Ukur hanya halaman yang terlihat; mengukur semuanya berarti mengunduh seluruh buku.
      behaviorControlParams: const PdfViewerBehaviorControlParams(
        loadPageDimensionsOnDemand: true,
      ),
      onViewerReady: (doc, c) {
        if (!mounted || attempt != _attempt) return;
        setState(() {
          _pages = doc.pages.length;
          _page = _page.clamp(1, _pages);
        });
      },
      onDocumentLoadFinished: (_, ok) => WidgetsBinding.instance
          .addPostFrameCallback((_) => _onLoaded(attempt, ok)),
      onPageChanged: (n) => WidgetsBinding.instance.addPostFrameCallback(
        (_) => _onPage(_ready ? n : null),
      ),
      onGeneralTap: (context, c, details) {
        if (details.type != PdfViewerGeneralTapType.tap) return false;
        setState(() => _bars = !_bars);
        return true;
      },
      loadingBannerBuilder: (_, _, _) => const SizedBox.shrink(),
      errorBannerBuilder: (_, _, _, _) => const SizedBox.shrink(),
    ),
  );

  Widget _topBar() => Positioned(
    top: 0,
    left: 0,
    right: 0,
    child: ColoredBox(
      color: const Color(0xE6131F2A),
      child: SafeArea(
        bottom: false,
        child: Row(
          children: [
            IconButton(
              tooltip: 'Back',
              color: Colors.white,
              icon: const Icon(Icons.arrow_back),
              onPressed: () => Navigator.pop(context),
            ),
            Expanded(
              child: Text(
                text(widget.book['judul']),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Colors.white,
                  fontFamily: serif,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              child: _DownloadBadge(source: _source!),
            ),
          ],
        ),
      ),
    ),
  );

  Widget _bottomBar() {
    final shown = _drag?.round() ?? _page;
    return Positioned(
      bottom: 0,
      left: 0,
      right: 0,
      child: ColoredBox(
        color: const Color(0xE6131F2A),
        child: SafeArea(
          top: false,
          child: Row(
            children: [
              IconButton(
                tooltip: 'Previous page',
                color: Colors.white,
                icon: const Icon(Icons.chevron_left),
                onPressed: _page > 1 ? () => _goTo(_page - 1) : null,
              ),
              Expanded(
                child: _pages > 1
                    ? Slider(
                        min: 1,
                        max: _pages.toDouble(),
                        value: shown.clamp(1, _pages).toDouble(),
                        label: '$shown',
                        activeColor: Lu.lantern,
                        onChanged: (v) => setState(() => _drag = v),
                        // Pindah saat dilepas: tiap halaman yang dilewati berarti unduhan.
                        onChangeEnd: (v) {
                          setState(() => _drag = null);
                          _goTo(v.round());
                        },
                      )
                    : const SizedBox.shrink(),
              ),
              TextButton(
                onPressed: _askPage,
                child: Text(
                  '$shown / $_pages',
                  style: const TextStyle(color: Colors.white),
                ),
              ),
              IconButton(
                tooltip: 'Next page',
                color: Colors.white,
                icon: const Icon(Icons.chevron_right),
                onPressed: _page < _pages ? () => _goTo(_page + 1) : null,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _errorView() => SafeArea(
    child: Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              _error,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white),
            ),
            const SizedBox(height: 16),
            FilledButton(onPressed: _open, child: const Text('Try again')),
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Back'),
            ),
          ],
        ),
      ),
    ),
  );
}

String _percent(double p) => '${(p * 100).floor()}%';

/// Layar tunggu saat buku dibuka dingin.
class ReaderLoading extends StatelessWidget {
  const ReaderLoading({super.key, required this.source, required this.onClose});
  final BookSource source;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: const Color(0xFF0B141D),
    child: SafeArea(
      child: Stack(
        children: [
          IconButton(
            tooltip: 'Back',
            color: Colors.white,
            icon: const Icon(Icons.arrow_back),
            onPressed: onClose,
          ),
          Center(
            child: ListenableBuilder(
              listenable: source,
              builder: (context, _) {
                final p = source.progress;
                return Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    SizedBox(
                      width: 200,
                      child: LinearProgressIndicator(
                        value: source.complete || p == null || p == 0
                            ? null
                            : p,
                        color: Lu.lantern,
                        backgroundColor: Colors.white24,
                        minHeight: 6,
                        borderRadius: BorderRadius.circular(3),
                      ),
                    ),
                    const SizedBox(height: 14),
                    Text(
                      source.complete
                          ? 'Opening…'
                          : 'Downloading ${_percent(p ?? 0)}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      source.retrying
                          ? 'Koneksi terputus, mencoba lagi…'
                          : 'Halaman tampil sebelum unduhan selesai.',
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 12,
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    ),
  );
}

/// Kemajuan unduhan latar; hilang saat buku lengkap.
class _DownloadBadge extends StatelessWidget {
  const _DownloadBadge({required this.source});
  final BookSource source;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: source,
    builder: (context, _) => source.complete
        ? const SizedBox.shrink()
        : Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                source.retrying ? Icons.cloud_off : Icons.download_outlined,
                size: 16,
                color: Colors.white70,
              ),
              Text(
                ' ${_percent(source.progress ?? 0)}',
                style: const TextStyle(color: Colors.white70, fontSize: 12),
              ),
            ],
          ),
  );
}
