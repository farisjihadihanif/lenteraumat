import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../format.dart';
import '../nav.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/book_picker.dart';
import '../widgets/markdown.dart';
import '../widgets/post.dart';
import '../widgets/quiz.dart';
import '../widgets/report.dart';
import '../widgets/ui.dart';
import 'book_detail.dart';
import 'discussion_form.dart';

/// Komentar utama + balasannya (satu tingkat). Balasan yang induknya hilang tampil
/// sebagai komentar biasa.
List<(Json, List<Json>)> threads(List<Json> comments) {
  final ids = {for (final c in comments) c['_id']};
  return [
    for (final c in comments)
      if (c['parent'] == null || !ids.contains(c['parent']))
        (
          c,
          [
            for (final r in comments)
              if (r['parent'] == c['_id']) r,
          ],
        ),
  ];
}

class DiscussionDetailScreen extends StatefulWidget {
  const DiscussionDetailScreen({super.key, required this.id});
  final String id;
  @override
  State<DiscussionDetailScreen> createState() => _DiscussionDetailScreenState();
}

class _DiscussionDetailScreenState extends State<DiscussionDetailScreen> {
  final _input = TextEditingController();
  final _focus = FocusNode();
  Json? _d;
  List<Json> _comments = [];
  Json? _replyTo;
  String _error = '';
  bool _notFound = false;
  bool _busy = false;
  bool? _signedIn;

  ApiClient get _api => AppScope.read(context).api;

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
    _input.dispose();
    _focus.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final r = await _api.get('/discussions/${widget.id}');
      if (!mounted) return;
      setState(() {
        _d = r['discussion'] as Json;
        _comments = jsonList(r['comments']);
        _error = '';
        _notFound = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = errorText(e);
        _notFound = e is ApiException && e.status == 404;
      });
      if (_d != null) toast(context, _error);
    }
  }

  void _patch(Json p) {
    if (mounted) setState(() => _d = {..._d!, ...p});
  }

  Future<void> _send() async {
    final isi = _input.text.trim();
    if (isi.isEmpty || _busy) return;
    if (!await requireLogin(context) || !mounted) return;
    setState(() => _busy = true);
    try {
      final r = await _api.post('/discussions/${widget.id}/comments', {
        'isi': isi,
        if (_replyTo != null) 'parent': _replyTo!['_id'],
      });
      if (!mounted) return;
      FocusScope.of(context).unfocus();
      setState(() {
        _comments = [..._comments, r['comment'] as Json];
        _d = {..._d!, 'balasanCount': (_d!['balasanCount'] as num? ?? 0) + 1};
        _input.clear();
        _replyTo = null;
      });
    } catch (e) {
      if (mounted) toast(context, errorText(e));
    }
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _deleteComment(Json c) async {
    final hasReplies = _comments.any((r) => r['parent'] == c['_id']);
    if (!await confirmDelete(
          context,
          'Delete reply?',
          hasReplies
              ? 'Komentar ini dan balasan-balasannya akan dihapus.'
              : 'Balasan ini akan dihapus.',
        ) ||
        !mounted) {
      return;
    }
    try {
      await _api.delete('/discussions/${widget.id}/comments/${c['_id']}');
      if (!mounted) return;
      setState(() {
        final before = _comments.length;
        _comments = [
          for (final x in _comments)
            if (x['_id'] != c['_id'] && x['parent'] != c['_id']) x,
        ];
        _d = {
          ..._d!,
          'balasanCount':
              (_d!['balasanCount'] as num? ?? 0) - (before - _comments.length),
        };
        if (_replyTo != null &&
            !_comments.any((x) => x['_id'] == _replyTo!['_id'])) {
          _replyTo = null;
        }
      });
    } catch (e) {
      if (mounted) toast(context, errorText(e));
    }
  }

  Future<void> _delete() async {
    if (!await confirmDelete(
          context,
          'Delete discussion?',
          'Diskusi beserta semua balasannya akan dihapus.',
        ) ||
        !mounted) {
      return;
    }
    try {
      await _api.delete('/discussions/${widget.id}');
      if (!mounted) return;
      toast(context, 'Diskusi dihapus.');
      Navigator.pop(context);
    } catch (e) {
      if (mounted) toast(context, errorText(e));
    }
  }

  Future<void> _shareKey(bool v) async {
    try {
      final r = await _api.patch('/discussions/${widget.id}', {
        'kunciPublik': v,
      });
      _patch({'kuis': (r['discussion'] as Json)['kuis']});
      if (mounted) {
        toast(
          context,
          v ? 'Kunci jawaban dibagikan.' : 'Kunci jawaban disembunyikan lagi.',
        );
      }
    } catch (e) {
      if (mounted) toast(context, errorText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = _d;
    return Scaffold(
      appBar: AppBar(
        actions: [
          if (d?['canEdit'] == true)
            PopupMenuButton<String>(
              tooltip: 'More',
              onSelected: (v) async {
                if (v == 'delete') return _delete();
                await push<String>(context, DiscussionFormScreen(edit: d));
                if (mounted) await _load();
              },
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'edit', child: Text('Edit')),
                PopupMenuItem(value: 'delete', child: Text('Delete')),
              ],
            ),
        ],
      ),
      body: d == null
          ? _error.isEmpty
                ? const Loading()
                : _notFound
                ? Empty(title: 'Discussion not found', body: _error)
                : ErrorRetry(message: _error, onRetry: _load)
          : Column(
              children: [
                Expanded(
                  child: RefreshIndicator(
                    onRefresh: _load,
                    child: _body(context, d),
                  ),
                ),
                _composer(context),
              ],
            ),
    );
  }

  Widget _body(BuildContext context, Json d) {
    final c = Lu.of(context);
    final book = d['book'];
    final cover = text(d['cover']);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
      children: [
        Text(text(d['judul']), style: serifStyle(context, 25)),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: UserLine(
                d['author'] as Json?,
                time: formatDate(d['createdAt']),
              ),
            ),
            ReportButton(
              type: 'discussion',
              id: widget.id,
              ownerId: (d['author'] as Json?)?['_id'],
            ),
          ],
        ),
        if (book is Json) ...[
          const SizedBox(height: 16),
          BookLine(
            book,
            onTap: () =>
                push<void>(context, BookDetailScreen(id: '${book['_id']}')),
          ),
        ],
        if (cover.startsWith('http')) ...[
          const SizedBox(height: 16),
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Image.network(
              cover,
              cacheWidth: 1200,
              errorBuilder: (_, _, _) => const SizedBox.shrink(),
            ),
          ),
        ],
        const SizedBox(height: 16),
        Md(text(d['isi'])),
        if (d['kuis'] is Json) ...[
          const SizedBox(height: 16),
          DiscussionQuiz(d['kuis'] as Json, onToggleShare: _shareKey),
        ],
        const SizedBox(height: 12),
        Divider(color: c.line, height: 1),
        PostActions(post: d, onChange: _patch, onReply: _focus.requestFocus),
        Divider(color: c.line, height: 1),
        const SizedBox(height: 20),
        Text(
          '${_comments.length} ${_comments.length == 1 ? 'comment' : 'comments'}',
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17),
        ),
        for (final (top, replies) in threads(_comments)) ...[
          _comment(context, top),
          if (replies.isNotEmpty)
            Container(
              margin: const EdgeInsets.only(left: 18),
              padding: const EdgeInsets.only(left: 14),
              decoration: BoxDecoration(
                border: Border(left: BorderSide(color: c.line, width: 2)),
              ),
              child: Column(
                children: [for (final r in replies) _comment(context, r)],
              ),
            ),
        ],
      ],
    );
  }

  Widget _comment(BuildContext context, Json x) {
    final c = Lu.of(context);
    final s = AppScope.of(context);
    final author = x['author'] as Json?;
    final replyTo = x['replyTo'];
    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          UserLine(author, time: timeAgo(x['createdAt']), size: 32),
          Padding(
            padding: const EdgeInsets.only(left: 42),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (replyTo is Json)
                  Text(
                    'membalas @${replyTo['username']}',
                    style: TextStyle(fontSize: 12, color: c.teal),
                  ),
                const SizedBox(height: 4),
                SelectableText(
                  text(x['isi']),
                  style: TextStyle(height: 1.5, color: c.inkSoft),
                ),
                Wrap(
                  children: [
                    TextButton(
                      onPressed: () {
                        setState(() => _replyTo = x);
                        _focus.requestFocus();
                      },
                      child: const Text('Reply'),
                    ),
                    ReportButton(
                      type: 'comment',
                      id: '${x['_id']}',
                      ownerId: author?['_id'],
                    ),
                    if (s.isMe(author?['_id']) || s.isAdmin)
                      TextButton(
                        onPressed: () => _deleteComment(x),
                        child: Text(
                          'Delete',
                          style: TextStyle(color: c.danger),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _composer(BuildContext context) {
    final c = Lu.of(context);
    if (!AppScope.of(context).signedIn) {
      return SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: () => requireLogin(context),
              child: const Text('Sign in untuk ikut membalas'),
            ),
          ),
        ),
      );
    }
    return DecoratedBox(
      decoration: BoxDecoration(
        color: c.surface,
        border: Border(top: BorderSide(color: c.line)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (_replyTo != null)
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Balas @${(_replyTo!['author'] as Json?)?['username'] ?? ''}',
                        style: TextStyle(fontSize: 12, color: c.teal),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Cancel reply',
                      icon: const Icon(Icons.close, size: 18),
                      onPressed: () => setState(() => _replyTo = null),
                    ),
                  ],
                ),
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: TextField(
                      controller: _input,
                      focusNode: _focus,
                      minLines: 1,
                      maxLines: 5,
                      maxLength: 5000,
                      decoration: const InputDecoration(
                        hintText: 'Tulis komentar',
                        counterText: '',
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Post comment',
                    color: c.teal,
                    icon: const Icon(Icons.send),
                    onPressed: _busy ? null : _send,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
