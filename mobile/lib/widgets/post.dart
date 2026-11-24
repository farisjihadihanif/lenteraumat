import 'package:material_ui/material_ui.dart';
import 'package:share_plus/share_plus.dart';

import '../api.dart';
import '../config.dart';
import '../format.dart';
import '../nav.dart';
import '../screens/book_detail.dart';
import '../screens/discussion_detail.dart';
import '../screens/user_profile.dart';
import '../state.dart';
import '../theme.dart';
import 'book_picker.dart';
import 'ui.dart';

/// Suka, repost, bagikan. [onChange] menerima kolom yang berubah.
class PostActions extends StatefulWidget {
  const PostActions({
    super.key,
    required this.post,
    required this.onChange,
    this.onReply,
  });
  final Json post;
  final void Function(Json patch) onChange;
  final VoidCallback? onReply;
  @override
  State<PostActions> createState() => _PostActionsState();
}

class _PostActionsState extends State<PostActions> {
  bool _busy = false;

  Future<void> _toggle(String kind) async {
    if (_busy || !await requireLogin(context) || !mounted) return;
    final s = AppScope.read(context);
    final active = kind == 'like' ? 'likedByMe' : 'repostedByMe';
    final count = kind == 'like' ? 'likeCount' : 'repostCount';
    final on = widget.post[active] == true;
    final n = widget.post[count] as num? ?? 0;
    final change = widget.onChange;
    // Tampilkan langsung, lalu sesuaikan dengan jawaban server.
    _busy = true;
    change({active: !on, count: n + (on ? -1 : 1)});
    try {
      final r = await s.api.post('/discussions/${widget.post['_id']}/$kind');
      change({
        active: r['active'],
        count: r['count'],
        if (kind == 'repost' && r['active'] == true) 'lastRepostBy': s.user,
      });
      if (mounted && kind == 'repost' && r['active'] == true) {
        toast(context, 'Di-repost ke profilmu.');
      }
    } catch (e) {
      change({active: on, count: n});
      if (mounted) toast(context, errorText(e));
    } finally {
      _busy = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.post;
    final c = Lu.of(context);
    Widget item(
      IconData icon,
      String label,
      Object? n,
      VoidCallback onTap, [
      Color? color,
    ]) => Semantics(
      button: true,
      label: n == null ? label : '$label, $n',
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(24),
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 44, minWidth: 48),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 19, color: color ?? c.inkMute),
                if (n != null)
                  Text(
                    ' $n',
                    style: TextStyle(fontSize: 13, color: color ?? c.inkMute),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
    final liked = p['likedByMe'] == true;
    final reposted = p['repostedByMe'] == true;
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        item(
          Icons.chat_bubble_outline,
          'Reply',
          p['balasanCount'] ?? 0,
          widget.onReply ??
              () => push<void>(
                context,
                DiscussionDetailScreen(id: '${p['_id']}'),
              ),
        ),
        item(
          Icons.repeat,
          'Repost',
          p['repostCount'] ?? 0,
          () => _toggle('repost'),
          reposted ? const Color(0xFF10B981) : null,
        ),
        item(
          liked ? Icons.favorite : Icons.favorite_border,
          'Like',
          p['likeCount'] ?? 0,
          () => _toggle('like'),
          liked ? const Color(0xFFE11D48) : null,
        ),
        item(
          Icons.share_outlined,
          'Share',
          null,
          () => SharePlus.instance.share(
            ShareParams(
              subject: text(p['judul']),
              text: '${p['judul']}\n$webBase/diskusi/${p['_id']}',
            ),
          ),
        ),
      ],
    );
  }
}

/// Nama + @username yang membuka profil.
class UserLine extends StatelessWidget {
  const UserLine(this.user, {super.key, this.time = '', this.size = 36});
  final Json? user;
  final String time;
  final double size;

  @override
  Widget build(BuildContext context) {
    final name = text(user?['username']);
    final mute = TextStyle(fontSize: 12, color: Lu.of(context).inkMute);
    return InkWell(
      onTap: name.isEmpty
          ? null
          : () => push<void>(context, UserProfileScreen(username: name)),
      child: Row(
        children: [
          Avatar(user, size: size),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  user == null ? 'Pengguna dihapus' : displayName(user),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                Text(
                  [
                    if (name.isNotEmpty) '@$name',
                    if (user?['role'] == 'admin') 'admin',
                    if (time.isNotEmpty) time,
                  ].join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: mute,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class PostCard extends StatelessWidget {
  const PostCard({
    super.key,
    required this.post,
    required this.onChange,
    this.onReturn,
  });
  final Json post;
  final void Function(Json patch) onChange;

  /// Dipanggil setelah kembali dari detail (hitungan bisa berubah).
  final VoidCallback? onReturn;

  @override
  Widget build(BuildContext context) {
    final c = Lu.of(context);
    final kuis = post['kuis'] as Json?;
    final book = post['book'];
    final cover = text(post['cover']);
    return Panel(
      onTap: () async {
        await push<void>(context, DiscussionDetailScreen(id: '${post['_id']}'));
        onReturn?.call();
      },
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (post['lastRepostBy'] is Json)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                '${displayName(post['lastRepostBy'] as Json)} me-repost',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: c.inkMute,
                ),
              ),
            ),
          UserLine(
            post['author'] as Json?,
            time: timeAgo(post['createdAt']),
            size: 40,
          ),
          const SizedBox(height: 10),
          Text(
            text(post['judul']),
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
          ),
          if (text(post['cuplikan']).isNotEmpty) ...[
            const SizedBox(height: 4),
            Text.rich(
              TextSpan(
                text: text(post['cuplikan']),
                children: [
                  if (post['terpotong'] == true)
                    TextSpan(
                      text: ' …more',
                      style: TextStyle(color: c.teal),
                    ),
                ],
              ),
              style: TextStyle(color: c.inkSoft, height: 1.5),
            ),
          ],
          if (jsonList(kuis?['soal']).isNotEmpty) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                Icon(Icons.quiz_outlined, color: c.teal),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Lembar soal · ${jsonList(kuis!['soal']).length} soal',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
          ],
          if (cover.startsWith('http')) ...[
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 260),
                child: Image.network(
                  cover,
                  fit: BoxFit.cover,
                  cacheWidth: 1000,
                  errorBuilder: (_, _, _) => const SizedBox.shrink(),
                ),
              ),
            ),
          ],
          if (book is Json) ...[
            const SizedBox(height: 10),
            BookLine(
              book,
              onTap: () =>
                  push<void>(context, BookDetailScreen(id: '${book['_id']}')),
            ),
          ],
          const SizedBox(height: 4),
          PostActions(post: post, onChange: onChange),
        ],
      ),
    );
  }
}

/// Dialog hapus. true = setuju.
Future<bool> confirmDelete(
  BuildContext context,
  String title,
  String body,
) async =>
    await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(
              'Delete',
              style: TextStyle(color: Lu.of(context).danger),
            ),
          ),
        ],
      ),
    ) ??
    false;
