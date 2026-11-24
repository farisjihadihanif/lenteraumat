import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../format.dart';
import '../nav.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/book.dart';
import '../widgets/ui.dart';
import 'discussion_detail.dart';

class UserProfileScreen extends StatefulWidget {
  const UserProfileScreen({super.key, required this.username});
  final String username;
  @override
  State<UserProfileScreen> createState() => _UserProfileScreenState();
}

class _UserProfileScreenState extends State<UserProfileScreen> {
  Json? _data;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await AppScope.read(context).api
          .get('/users/${widget.username}');
      if (mounted) {
        setState(() {
          _data = r;
          _error = '';
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    if (d == null) {
      return Scaffold(
        appBar: AppBar(),
        body: _error.isEmpty
            ? const Loading()
            : ErrorRetry(message: _error, onRetry: _load),
      );
    }
    final books = jsonList(d['books']);
    final posts = jsonList(d['discussions']);
    final reposts = jsonList(d['reposts']);
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(),
        body: NestedScrollView(
          headerSliverBuilder: (_, _) => [
            SliverToBoxAdapter(child: _header(context, d['user'] as Json)),
            SliverToBoxAdapter(
              child: TabBar(
                isScrollable: true,
                tabAlignment: TabAlignment.start,
                tabs: [
                  Tab(text: 'Books ${books.length}'),
                  Tab(text: 'Discussions ${posts.length}'),
                  Tab(text: 'Reposts ${reposts.length}'),
                ],
              ),
            ),
          ],
          body: TabBarView(
            children: [
              books.isEmpty
                  ? const Empty(title: 'Belum ada buku yang tayang.')
                  : LayoutBuilder(
                      builder: (context, box) => GridView.builder(
                        padding: const EdgeInsets.all(16),
                        gridDelegate: bookGrid(context, box.maxWidth - 32),
                        itemCount: books.length,
                        itemBuilder: (_, i) => BookCard(books[i]),
                      ),
                    ),
              _posts(posts, 'Belum memulai diskusi.'),
              _posts(reposts, 'Belum ada repost.', repost: true),
            ],
          ),
        ),
      ),
    );
  }

  Widget _header(BuildContext context, Json u) {
    final c = Lu.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Avatar(u, size: 76),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(displayName(u), style: serifStyle(context, 22)),
                    Text(
                      '@${u['username']}${u['role'] == 'admin' ? ' · admin' : ''}',
                      style: TextStyle(color: c.inkMute),
                    ),
                    Text(
                      'bergabung ${formatDate(u['createdAt'])}',
                      style: TextStyle(color: c.inkMute, fontSize: 12),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (text(u['bio']).isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(
                text(u['bio']),
                style: TextStyle(color: c.inkSoft, height: 1.5),
              ),
            ),
          Wrap(
            children: [
              for (final (label, key) in const [
                ('Instagram', 'instagramUrl'),
                ('LinkedIn', 'linkedinUrl'),
              ])
                if (text(u[key]).isNotEmpty)
                  TextButton(
                    onPressed: () => openLink(context, text(u[key])),
                    child: Text(label),
                  ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _posts(List<Json> items, String empty, {bool repost = false}) =>
      items.isEmpty
      ? Empty(title: empty)
      : ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: items.length,
          separatorBuilder: (_, _) => const SizedBox(height: 10),
          itemBuilder: (context, i) {
            final d = items[i];
            return Panel(
              onTap: () => push<void>(
                context,
                DiscussionDetailScreen(id: '${d['_id']}'),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (repost)
                    Text(
                      'dari ${displayName(d['author'] as Json?)}',
                      style: TextStyle(
                        fontSize: 12,
                        color: Lu.of(context).inkMute,
                      ),
                    ),
                  Text(
                    text(d['judul']),
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${timeAgo(d['createdAt'])} · ${d['balasanCount'] ?? 0} balasan · ${d['likeCount'] ?? 0} suka · ${d['repostCount'] ?? 0} repost',
                    style: TextStyle(
                      fontSize: 12,
                      color: Lu.of(context).inkMute,
                    ),
                  ),
                ],
              ),
            );
          },
        );
}
