import 'dart:math' as math;

import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../format.dart';
import '../nav.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/book.dart';
import '../widgets/ui.dart';
import 'discussion_detail.dart';
import 'discussions.dart';

const _tagline =
    'LenteraUmat Digital Library ~ read the book, discuss, summary and create a Quiz with Luma';

const _luma = [
  (
    Icons.chat_bubble_outline,
    'Ask anything',
    'Pelajaran, ibadah, atau topik yang sedang kamu pelajari. Bisa sambil kirim foto, PDF, atau video.',
  ),
  (
    Icons.menu_book_outlined,
    'Ask about a book',
    'Pilih buku dari Library, lalu tanyakan bagian yang belum jelas. LUMA menyebut halamannya.',
  ),
  (
    Icons.article_outlined,
    'Summary',
    'Gambaran isi buku sebelum kamu membacanya, atau pengingat setelah selesai.',
  ),
  (
    Icons.quiz_outlined,
    'Quiz',
    'Latihan soal dengan nilai otomatis, atau lembar soal lengkap dengan kunci jawaban untuk guru.',
  ),
];

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  List<Json>? _posts;
  List<Json>? _books;
  int _total = 0;
  String _postsError = '';
  String _booksError = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = AppScope.read(context).api;
    await Future.wait([
      api
          .get('/discussions', query: {'sort': 'terbaru', 'limit': 4})
          .then((r) {
            if (mounted) {
              setState(() {
                _posts = jsonList(r['items']);
                _postsError = '';
              });
            }
          })
          .catchError((Object e) {
            if (mounted) setState(() => _postsError = errorText(e));
          }),
      api
          .get('/books', query: {'sort': 'terbaru', 'limit': 6})
          .then((r) {
            if (mounted) {
              setState(() {
                _books = jsonList(r['items']);
                _total = (r['total'] as num?)?.toInt() ?? 0;
                _booksError = '';
              });
            }
          })
          .catchError((Object e) {
            if (mounted) setState(() => _booksError = errorText(e));
          }),
    ]);
  }

  Widget _heading(String t) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: Text(t, style: serifStyle(context, 28)),
  );

  @override
  Widget build(BuildContext context) => Scaffold(
    body: RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          const _Hero(),
          _discussion(),
          const _LumaSection(),
          _library(),
        ],
      ),
    ),
  );

  Widget _discussion() => Padding(
    padding: const EdgeInsets.fromLTRB(16, 28, 16, 32),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _heading('Discussion'),
        Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: FilledButton.icon(
            icon: const Icon(Icons.edit_outlined),
            label: const Text('Start a discussion'),
            onPressed: () async {
              if (await startDiscussion(context) && mounted) await _load();
            },
          ),
        ),
        if (_posts == null && _postsError.isNotEmpty)
          ErrorRetry(message: _postsError, onRetry: _load)
        else if (_posts == null)
          const Loading()
        else if (_posts!.isEmpty)
          const Empty(title: 'Belum ada diskusi.')
        else ...[
          for (final p in _posts!)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: DiscussionCard(p),
            ),
          const SizedBox(height: 8),
          Center(
            child: OutlinedButton(
              onPressed: () => openTab(context, tabDiscussions),
              child: const Text('See all discussions'),
            ),
          ),
        ],
      ],
    ),
  );

  Widget _library() => Padding(
    padding: const EdgeInsets.fromLTRB(16, 32, 16, 32),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _heading('Library'),
        if (_books == null && _booksError.isNotEmpty)
          ErrorRetry(message: _booksError, onRetry: _load)
        else if (_books == null)
          const Loading()
        else if (_books!.isEmpty)
          const Empty(title: 'Belum ada buku di Library.')
        else ...[
          LayoutBuilder(
            builder: (context, box) => GridView.builder(
              shrinkWrap: true,
              padding: EdgeInsets.zero,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: bookGrid(context, box.maxWidth),
              itemCount: _books!.length,
              itemBuilder: (_, i) => BookCard(_books![i]),
            ),
          ),
          if (_total > _books!.length)
            Center(
              child: Padding(
                padding: const EdgeInsets.only(top: 20),
                child: OutlinedButton(
                  onPressed: () => openTab(context, tabLibrary),
                  child: const Text('More books'),
                ),
              ),
            ),
        ],
      ],
    ),
  );
}

class _Hero extends StatelessWidget {
  const _Hero();

  @override
  Widget build(BuildContext context) {
    final mist = Lu.of(context).mist;
    return SizedBox(
      // Ikut membesar bersama ukuran huruf perangkat.
      height: math.max(400, MediaQuery.textScalerOf(context).scale(330)),
      child: Stack(
        fit: StackFit.expand,
        children: [
          Image.asset(
            'assets/brand/hero.jpg',
            fit: BoxFit.cover,
            color: Colors.black,
            colorBlendMode: BlendMode.saturation,
          ),
          const ColoredBox(color: Color(0x99000000)),
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                stops: const [.7, 1],
                colors: [mist.withValues(alpha: 0), mist],
              ),
            ),
          ),
          const SafeArea(
            bottom: false,
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  FittedBox(
                    child: Text(
                      'LenteraUmat',
                      style: TextStyle(
                        fontFamily: serif,
                        fontWeight: FontWeight.w600,
                        fontSize: 52,
                        color: Colors.white,
                        shadows: [Shadow(color: Colors.black, blurRadius: 4)],
                      ),
                    ),
                  ),
                  SizedBox(height: 16),
                  Text(
                    _tagline,
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white, height: 1.5),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class DiscussionCard extends StatelessWidget {
  const DiscussionCard(this.post, {super.key});
  final Json post;

  @override
  Widget build(BuildContext context) {
    final c = Lu.of(context);
    final author = post['author'] as Json?;
    final small = TextStyle(fontSize: 13, color: c.inkMute);
    return Panel(
      onTap: () =>
          push<void>(context, DiscussionDetailScreen(id: '${post['_id']}')),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Avatar(author, size: 32),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      displayName(author),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    Text(timeAgo(post['createdAt']), style: small),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            text(post['judul']),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
          ),
          if (text(post['cuplikan']).isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              text(post['cuplikan']),
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: c.inkSoft, height: 1.5),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Icon(Icons.favorite_border, size: 16, color: c.inkMute),
              Text(
                ' ${post['likeCount'] ?? 0}',
                semanticsLabel: '${post['likeCount'] ?? 0} suka',
                style: small,
              ),
              const SizedBox(width: 16),
              Icon(Icons.chat_bubble_outline, size: 16, color: c.inkMute),
              Text(
                ' ${post['balasanCount'] ?? 0}',
                semanticsLabel: '${post['balasanCount'] ?? 0} komentar',
                style: small,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _LumaSection extends StatelessWidget {
  const _LumaSection();

  @override
  Widget build(BuildContext context) => Container(
    color: Lu.forest,
    padding: const EdgeInsets.fromLTRB(16, 32, 16, 24),
    child: Column(
      children: [
        Row(
          children: [
            Image.asset('assets/brand/luma.png', width: 72, height: 72),
            const SizedBox(width: 12),
            const Expanded(
              child: Text(
                'Learning Together with LUMA',
                style: TextStyle(
                  fontFamily: serif,
                  fontWeight: FontWeight.w600,
                  fontSize: 26,
                  height: 1.2,
                  color: Colors.white,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),
        for (final (icon, title, body) in _luma)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Material(
              color: Colors.transparent,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
                side: const BorderSide(color: Colors.white24),
              ),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: () => openTab(context, tabLuma),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(icon, color: Lu.lamp),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              title,
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w700,
                                fontSize: 17,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              body,
                              style: const TextStyle(
                                color: Color(0xE6FFFFFF),
                                height: 1.5,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
      ],
    ),
  );
}
