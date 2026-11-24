import 'dart:async';

import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../format.dart';
import '../nav.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/book_picker.dart';
import '../widgets/markdown.dart';
import '../widgets/pick.dart';
import '../widgets/post.dart';
import '../widgets/quiz.dart';
import '../widgets/ui.dart';
import 'discussion_detail.dart';
import 'reader.dart';

const _modes = [
  ('chat', 'Chat', Icons.chat_bubble_outline),
  ('ask', 'Ask a book', Icons.menu_book_outlined),
  ('summary', 'Summary', Icons.article_outlined),
  ('quiz', 'Quiz', Icons.quiz_outlined),
];
const _maxFiles = 4;

/// Tab LUMA; tamu diminta masuk. Dibuat ulang saat akun berganti.
class LumaTab extends StatelessWidget {
  const LumaTab({super.key});

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    if (s.signedIn) return LumaScreen(key: ValueKey(s.user!['_id']));
    return Scaffold(
      appBar: AppBar(title: const Text('LUMA')),
      body: Center(
        child: SingleChildScrollView(
          child: Column(
            children: [
              Image.asset('assets/brand/luma.png', width: 112, height: 112),
              Empty(
                title: "Hi! I'm LUMA.",
                body:
                    'Masuk untuk bertanya, merangkum buku, dan membuat kuis bersama LUMA.',
                action: FilledButton(
                  onPressed: () => requireLogin(context),
                  child: const Text('Sign in'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class LumaScreen extends StatefulWidget {
  const LumaScreen({super.key});
  @override
  State<LumaScreen> createState() => _LumaScreenState();
}

class _LumaScreenState extends State<LumaScreen> {
  final _input = TextEditingController();
  final _topik = TextEditingController();
  final _jenjang = TextEditingController();
  final _scroll = ScrollController();

  Json? _status;
  Json? _quota;
  String? _session;
  List<Json> _messages = [];
  String _mode = 'chat';
  Json? _book;
  List<FormFile> _files = [];
  bool _busy = false;

  /// Teks yang sedang mengalir.
  String _live = '';
  String _liveNext = '';
  Timer? _frame;

  /// Berubah tiap pindah percakapan: jawaban lama tidak masuk ke percakapan baru.
  int _turn = 0;

  // Ringkasan & kuis
  String _length = 'sedang';
  String _for = 'latihan';
  String _source = 'buku';
  String _type = 'pilihan';
  int _count = 5;
  String _level = 'sedang';

  ApiClient get _api => AppScope.read(context).api;
  bool get _disabled => _status != null && _status!['enabled'] != true;
  bool get _needsBook =>
      _mode == 'ask' ||
      _mode == 'summary' ||
      (_mode == 'quiz' && _source == 'buku');

  @override
  void initState() {
    super.initState();
    lumaRequest.addListener(_onRequest);
    _onRequest();
    _api.get('/ai/status').then((r) {
      if (mounted) setState(() => _status = r);
    }, onError: (_) {});
    _loadQuota();
  }

  @override
  void dispose() {
    lumaRequest.removeListener(_onRequest);
    _frame?.cancel();
    for (final c in [_input, _topik, _jenjang]) {
      c.dispose();
    }
    _scroll.dispose();
    super.dispose();
  }

  void _loadQuota() => _api.get('/ai/usage').then((r) {
    if (mounted) setState(() => _quota = r);
  }, onError: (_) {});

  /// Permintaan dari layar lain (kartu beranda, "Ask LUMA").
  void _onRequest() {
    final r = lumaRequest.value;
    if (r == null) return;
    lumaRequest.value = null;
    setState(() {
      _mode = r.mode;
      if (r.book != null) _book = r.book;
      _reset();
    });
  }

  /// Panggil di dalam setState.
  void _reset() {
    _turn++;
    _session = null;
    _messages = [];
    _clearLive();
  }

  void _clearLive() {
    _frame?.cancel();
    _frame = null;
    _live = _liveNext = '';
  }

  void _changeMode(String m) {
    if (m == _mode) return;
    setState(() {
      _mode = m;
      if (m == 'chat' || _messages.isNotEmpty) _reset();
    });
  }

  Future<void> _choose() async {
    final b = await pickBook(context);
    if (b == null || !mounted) return;
    setState(() {
      _book = b;
      _reset();
    });
  }

  /// Teks mengalir ditampilkan paling sering tiap 60 md.
  void _onText(String t) {
    _liveNext = t;
    _frame ??= Timer(const Duration(milliseconds: 60), () {
      _frame = null;
      if (!mounted) return;
      final follow =
          !_scroll.hasClients || _scroll.position.extentAfter < 160;
      setState(() => _live = _liveNext);
      // Ikuti hanya kalau pembaca masih di bagian bawah.
      if (follow) _toEnd(jump: true);
    });
  }

  void _toEnd({bool jump = false}) =>
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || !_scroll.hasClients) return;
        final end = _scroll.position.maxScrollExtent;
        if (jump) {
          _scroll.jumpTo(end);
        } else {
          _scroll.animateTo(
            end,
            duration: const Duration(milliseconds: 250),
            curve: Curves.easeOut,
          );
        }
      });

  Future<void> _run(
    String kind,
    String preview,
    Future<Json> Function(void Function(String) onText) request, {
    List<FormFile> files = const [],
    String restore = '',
  }) async {
    final mine = _turn;
    bool here() => mounted && mine == _turn;
    final pending = <String, dynamic>{
      'role': 'user',
      'content': preview,
      'kind': kind,
      'lampiran': [
        for (final f in files) {'name': f.name},
      ],
    };
    setState(() {
      _busy = true;
      _messages = [..._messages, pending];
    });
    _toEnd();
    try {
      final r = await request((t) {
        if (here()) _onText(t);
      });
      if (here()) {
        setState(() {
          _clearLive();
          _session = '${r['sessionId']}';
          _messages = [
            ..._messages,
            {
              'role': 'model',
              'kind': kind,
              'content': text(r['reply']),
              if (r['quiz'] is Json) 'data': r['quiz'],
            },
          ];
        });
        _toEnd();
      }
    } catch (e) {
      if (here()) {
        setState(() {
          _clearLive();
          _messages = [
            for (final m in _messages)
              if (!identical(m, pending)) m,
          ];
          if (_input.text.isEmpty) _input.text = restore;
          if (_files.isEmpty) _files = files;
        });
      }
      if (mounted) toast(context, errorText(e));
    }
    if (!mounted) return;
    setState(() => _busy = false);
    _loadQuota();
  }

  Future<void> _send() async {
    final message = _input.text.trim();
    if ((message.isEmpty && _files.isEmpty) || _busy) return;
    if (_mode == 'ask' && _book == null) return _choose();
    final total = (_status?['maxAttachTotalMb'] as num?) ?? 4;
    if (_status?['maxAttachTotalMb'] != null || _status == null) {
      if (_files.fold(0, (n, f) => n + f.size) > total * mb) {
        return toast(
          context,
          'Total lampiran lebih dari $total MB. Hapus salah satu lampiran.',
        );
      }
    }
    final files = [for (final f in _files) f.as('lampiran')];
    setState(() {
      _input.clear();
      _files = [];
    });
    final api = _api;
    final body = {
      'message': message,
      'sessionId': _session,
      'bookId': _mode == 'ask' && _session == null ? _book!['_id'] : null,
    };
    await _run(
      _mode == 'ask' ? 'ask' : 'chat',
      message,
      (onText) =>
          api.stream('/ai/chat', body: body, files: files, onText: onText),
      files: files,
      restore: message,
    );
  }

  Future<void> _summary() {
    final api = _api;
    final body = {
      'bookId': _book!['_id'],
      'length': _length,
      'sessionId': _session,
    };
    return _run(
      'summary',
      'Ringkas buku “${_book!['judul']}”',
      (onText) => api.stream('/ai/summary', body: body, onText: onText),
    );
  }

  Future<void> _quiz() {
    final fromBook = _source == 'buku';
    final guru = _for == 'guru';
    final about = fromBook ? text(_book!['judul']) : _topik.text.trim();
    final jenis = {
      'pilihan': 'pilihan ganda',
      'isian': 'isian',
      'esai': 'esai',
      'campuran': 'campuran',
    }[_type];
    final api = _api;
    final body = {
      if (fromBook) 'bookId': _book!['_id'] else 'topik': about,
      'untuk': _for,
      'type': _type,
      'count': _count,
      'level': _level,
      if (guru) 'jenjang': _jenjang.text.trim(),
      'sessionId': ?_session,
    };
    return _run(
      'quiz',
      '${guru ? 'Buatkan lembar' : 'Buat'} $_count soal $jenis ($_level) tentang “$about”${guru ? ' beserta kunci jawaban' : ''}',
      (_) => api.postSlow('/ai/quiz', body),
    );
  }

  Future<void> _attach() async {
    final kind = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.image_outlined),
              title: const Text('Photo'),
              onTap: () => Navigator.pop(context, 'photo'),
            ),
            ListTile(
              leading: const Icon(Icons.attach_file),
              title: const Text('File (PDF, text, audio, video)'),
              onTap: () => Navigator.pop(context, 'file'),
            ),
          ],
        ),
      ),
    );
    if (kind == null || !mounted) return;
    try {
      final max = (_status?['maxAttachMb'] as num?)?.toInt() ?? 4;
      final List<FormFile> picked;
      if (kind == 'photo') {
        final f = await pickPhoto();
        picked = [?f];
      } else {
        picked = await pickAttachments();
      }
      for (final f in picked) {
        if (f.size > max * mb) {
          throw ApiException(
            0,
            '${f.name} lebih dari $max MB. Pilih file yang lebih kecil.',
          );
        }
      }
      if (!mounted) return;
      final next = [..._files, ...picked];
      if (next.length > _maxFiles) {
        toast(context, 'Maksimal $_maxFiles lampiran sekali kirim.');
      }
      setState(() => _files = next.take(_maxFiles).toList());
    } catch (e) {
      if (mounted) toast(context, errorText(e));
    }
  }

  Future<void> _history() async {
    final id = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => FractionallySizedBox(
        heightFactor: .8,
        child: _History(
          current: _session,
          onDeleted: (id) {
            if (id == _session && mounted) setState(_reset);
          },
        ),
      ),
    );
    if (id == null || !mounted) return;
    setState(_reset);
    final mine = _turn;
    try {
      final s = (await _api.get('/ai/sessions/$id'))['session'] as Json;
      if (!mounted || mine != _turn) return;
      final messages = jsonList(s['messages']);
      final last = messages.isEmpty ? 'chat' : text(messages.last['kind']);
      setState(() {
        _session = '${s['_id']}';
        _messages = messages;
        _book = s['book'] is Json ? s['book'] as Json : null;
        _mode = _book == null ? 'chat' : (last == 'chat' ? 'ask' : last);
      });
      _toEnd(jump: true);
    } catch (e) {
      if (mounted) toast(context, errorText(e));
    }
  }

  Future<void> _postQuiz(Json quiz) async {
    final id = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => _PostQuiz(quiz),
    );
    if (id == null || !mounted) return;
    toast(context, 'Soal diposting ke Discussion.');
    await push<void>(context, DiscussionDetailScreen(id: id));
  }

  Future<void> _openBook() async {
    try {
      final r = await _api.get('/books/${_book!['_id']}');
      if (mounted) {
        await push<void>(context, ReaderScreen(book: r['book'] as Json));
      }
    } catch (e) {
      if (mounted) toast(context, errorText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = Lu.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('LUMA'),
        actions: [
          IconButton(
            tooltip: 'New chat',
            icon: const Icon(Icons.add_comment_outlined),
            onPressed: () => setState(_reset),
          ),
          IconButton(
            tooltip: 'History',
            icon: const Icon(Icons.history),
            onPressed: _history,
          ),
        ],
      ),
      body: Column(
        children: [
          SizedBox(
            height: 52,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: [
                for (final (id, label, icon) in _modes)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      avatar: Icon(icon, size: 16),
                      label: Text(label),
                      showCheckmark: false,
                      selected: _mode == id,
                      onSelected: (_) => _changeMode(id),
                    ),
                  ),
              ],
            ),
          ),
          if (_needsBook)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: _book == null
                  ? OutlinedButton.icon(
                      icon: const Icon(Icons.menu_book_outlined),
                      label: const Text('Choose book'),
                      onPressed: _choose,
                    )
                  : BookLine(
                      _book!,
                      trailing: TextButton(
                        onPressed: _choose,
                        child: const Text('Change'),
                      ),
                    ),
            ),
          Expanded(child: _conversation(context)),
          DecoratedBox(
            decoration: BoxDecoration(
              color: c.surface,
              border: Border(top: BorderSide(color: c.line)),
            ),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (_mode == 'summary')
                    _summaryForm()
                  else if (_mode == 'quiz')
                    _quizForm()
                  else
                    _composer(context),
                  const SizedBox(height: 6),
                  _note(context),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _note(BuildContext context) {
    final c = Lu.of(context);
    final left = _quota?['remaining'] as num?;
    return Wrap(
      alignment: WrapAlignment.center,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        Text(
          '${left == null ? '' : 'Sisa $left dari ${_quota!['limit']} permintaan hari ini. '}LUMA bisa keliru. Periksa kembali jawaban penting.',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 11,
            color: left != null && left <= 5 ? c.lanternText : c.inkMute,
          ),
        ),
        if (_book != null && _mode != 'chat')
          TextButton(
            onPressed: _openBook,
            child: const Text('Open the book', style: TextStyle(fontSize: 12)),
          ),
      ],
    );
  }

  Widget _conversation(BuildContext context) {
    final c = Lu.of(context);
    final user = AppScope.of(context).user;
    final nama = displayName(user).split(' ').first;
    return SelectionArea(
      child: ListView(
        controller: _scroll,
        padding: const EdgeInsets.all(16),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        children: [
          if (_disabled)
            const ErrorBox(
              'LUMA belum aktif di server ini. Coba lagi nanti.',
            ),
          if (_messages.isEmpty && !_busy) ...[
            const SizedBox(height: 12),
            Image.asset('assets/brand/luma.png', height: 104),
            const SizedBox(height: 10),
            Text(
              "Hi, $nama! I'm LUMA.",
              textAlign: TextAlign.center,
              style: serifStyle(context, 22),
            ),
            const SizedBox(height: 6),
            Text(
              switch (_mode) {
                'ask' =>
                  'Pilih buku, lalu tanyakan isinya. LUMA menjawab berdasarkan buku dan menyebut halamannya.',
                'summary' =>
                  'Pilih panjang ringkasan, lalu aku rangkum isi bukunya.',
                'quiz' =>
                  _for == 'guru'
                      ? 'Buat lembar soal lengkap dengan kunci jawaban, lalu posting ke Discussion untuk dikerjakan murid.'
                      : 'Pilih buku atau tulis topik, lalu uji pemahamanmu.',
                _ =>
                  'Tanya apa saja. Bisa juga kirim foto catatan, PDF, atau video untuk dibahas.',
              },
              textAlign: TextAlign.center,
              style: TextStyle(color: c.inkSoft, height: 1.5),
            ),
          ],
          for (final m in _messages) _message(context, m),
          if (_live.isNotEmpty) _bubble(context, Md(_live, selectable: false)),
          if (_busy && _live.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 14),
              child: Row(
                children: [
                  const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      semanticsLabel: 'LUMA sedang menulis',
                    ),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    _mode == 'quiz'
                        ? 'Menyusun soal…'
                        : _mode != 'chat' && _session == null
                        ? 'Membaca buku…'
                        : 'LUMA sedang menulis…',
                    style: TextStyle(color: c.inkMute),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _bubble(BuildContext context, Widget child) {
    final c = Lu.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Image.asset('assets/brand/luma.png', width: 32, height: 32),
          const SizedBox(width: 8),
          Expanded(
            child: Container(
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
              decoration: BoxDecoration(
                color: c.surface,
                border: Border.all(color: c.line),
                borderRadius: BorderRadius.circular(14),
              ),
              child: child,
            ),
          ),
        ],
      ),
    );
  }

  Widget _message(BuildContext context, Json m) {
    if (m['role'] == 'user') {
      final files = jsonList(m['lampiran']);
      return Align(
        alignment: Alignment.centerRight,
        child: Container(
          margin: const EdgeInsets.only(top: 14, left: 40),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: Lu.forest,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final f in files)
                Text(
                  '📎 ${f['name']}',
                  style: const TextStyle(color: Colors.white70, fontSize: 12),
                ),
              if (text(m['content']).isNotEmpty)
                Text(
                  text(m['content']),
                  style: const TextStyle(color: Colors.white, height: 1.45),
                ),
            ],
          ),
        ),
      );
    }
    final quiz = m['data'];
    if (m['kind'] == 'quiz' && quiz is Json) {
      void post() => _postQuiz(quiz);
      return _bubble(
        context,
        quiz['untuk'] == 'guru'
            ? QuizSheet(quiz, key: ObjectKey(m), onPost: post)
            : QuizCard(quiz, key: ObjectKey(m), onPost: post),
      );
    }
    return _bubble(
      context,
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Md(text(m['content']), selectable: false),
          TextButton.icon(
            icon: const Icon(Icons.copy, size: 14),
            label: const Text('Copy', style: TextStyle(fontSize: 12)),
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: text(m['content'])));
              if (context.mounted) toast(context, 'Disalin.');
            },
          ),
        ],
      ),
    );
  }

  Widget _composer(BuildContext context) => Column(
    mainAxisSize: MainAxisSize.min,
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      if (_files.isNotEmpty)
        Wrap(
          spacing: 6,
          children: [
            for (final f in _files)
              InputChip(
                label: Text(
                  '${f.name} · ${formatSize(f.size)}',
                  style: const TextStyle(fontSize: 12),
                ),
                deleteButtonTooltipMessage: 'Remove attachment',
                onDeleted: () => setState(
                  () => _files = [
                    for (final x in _files)
                      if (!identical(x, f)) x,
                  ],
                ),
              ),
          ],
        ),
      Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          IconButton(
            tooltip: 'Attach',
            icon: const Icon(Icons.attach_file),
            onPressed: _disabled || _files.length >= _maxFiles ? null : _attach,
          ),
          Expanded(
            child: TextField(
              controller: _input,
              enabled: !_disabled,
              minLines: 1,
              maxLines: 6,
              maxLength: 4000,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(
                counterText: '',
                hintText: _mode != 'ask'
                    ? 'Tulis pesan'
                    : _book == null
                    ? 'Pilih buku dulu'
                    : 'Tanya tentang “${_book!['judul']}”',
                hintMaxLines: 1,
              ),
            ),
          ),
          IconButton(
            tooltip: 'Send',
            color: Lu.of(context).teal,
            icon: const Icon(Icons.send),
            onPressed: _busy || _disabled ? null : _send,
          ),
        ],
      ),
    ],
  );

  Widget _summaryForm() => Row(
    children: [
      Expanded(
        child: _select(
          'Panjang',
          _length,
          const {
            'singkat': 'Singkat',
            'sedang': 'Sedang',
            'lengkap': 'Lengkap per bab',
          },
          (v) => _length = v,
        ),
      ),
      const SizedBox(width: 10),
      FilledButton(
        onPressed: _book == null || _busy || _disabled ? null : _summary,
        child: const Text('Create summary'),
      ),
    ],
  );

  Widget _quizForm() {
    final guru = _for == 'guru';
    return ConstrainedBox(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * .42,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SegmentedButton<String>(
              showSelectedIcon: false,
              segments: const [
                ButtonSegment(value: 'latihan', label: Text('Self practice')),
                ButtonSegment(value: 'guru', label: Text('For students')),
              ],
              selected: {_for},
              onSelectionChanged: (v) => setState(() {
                _for = v.first;
                if (_for == 'latihan') {
                  if (!const ['pilihan', 'isian'].contains(_type)) {
                    _type = 'pilihan';
                  }
                  if (_count > 15) _count = 15;
                } else if (_count == 3) {
                  _count = 5;
                }
              }),
            ),
            const SizedBox(height: 8),
            SegmentedButton<String>(
              showSelectedIcon: false,
              segments: const [
                ButtonSegment(value: 'buku', label: Text('From a book')),
                ButtonSegment(value: 'topik', label: Text('From a topic')),
              ],
              selected: {_source},
              onSelectionChanged: (v) => setState(() => _source = v.first),
            ),
            if (_source == 'topik') ...[
              const SizedBox(height: 8),
              TextField(
                controller: _topik,
                maxLength: 300,
                onChanged: (_) => setState(() {}),
                decoration: const InputDecoration(
                  counterText: '',
                  hintText: 'Topik soal, mis. Thaharah dan macam-macam air',
                ),
              ),
            ],
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: _select('Jenis', _type, {
                    'pilihan': 'Pilihan ganda',
                    'isian': 'Isian singkat',
                    if (guru) 'esai': 'Esai',
                    if (guru) 'campuran': 'Campuran',
                  }, (v) => _type = v),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _select('Jumlah', '$_count', {
                    for (final n in guru
                        ? const [5, 10, 15, 20, 25, 30]
                        : const [3, 5, 10, 15])
                      '$n': '$n soal',
                  }, (v) => _count = int.parse(v)),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _select('Tingkat', _level, const {
                    'mudah': 'Mudah',
                    'sedang': 'Sedang',
                    'sulit': 'Sulit',
                  }, (v) => _level = v),
                ),
              ],
            ),
            if (guru) ...[
              const SizedBox(height: 8),
              TextField(
                controller: _jenjang,
                maxLength: 80,
                decoration: const InputDecoration(
                  counterText: '',
                  labelText: 'Untuk kelas',
                  hintText: 'mis. SMP kelas 8',
                ),
              ),
            ],
            const SizedBox(height: 8),
            FilledButton(
              onPressed:
                  _busy ||
                      _disabled ||
                      (_source == 'buku'
                          ? _book == null
                          : _topik.text.trim().length < 3)
                  ? null
                  : _quiz,
              child: Text(guru ? 'Create question sheet' : 'Create quiz'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _select(
    String label,
    String value,
    Map<String, String> items,
    void Function(String) set,
  ) => DropdownButtonFormField<String>(
    key: ValueKey('$label-$value-${items.length}'),
    initialValue: value,
    isExpanded: true,
    decoration: InputDecoration(
      labelText: label,
      contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
    ),
    items: [
      for (final e in items.entries)
        DropdownMenuItem(
          value: e.key,
          child: Text(
            e.value,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 13),
          ),
        ),
    ],
    onChanged: (v) => setState(() => set(v!)),
  );
}

class _History extends StatefulWidget {
  const _History({required this.current, required this.onDeleted});
  final String? current;
  final void Function(String id) onDeleted;
  @override
  State<_History> createState() => _HistoryState();
}

class _HistoryState extends State<_History> {
  List<Json>? _items;
  String _error = '';

  ApiClient get _api => AppScope.read(context).api;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await _api.get('/ai/sessions');
      if (mounted) {
        setState(() {
          _items = jsonList(r['items']);
          _error = '';
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
  }

  Future<void> _rename(Json s) async {
    final input = TextEditingController(text: text(s['title']));
    final title = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Rename chat'),
        content: TextField(controller: input, maxLength: 80, autofocus: true),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, input.text.trim()),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (title == null || title.isEmpty || !mounted) return;
    try {
      await _api.patch('/ai/sessions/${s['_id']}', {'title': title});
      await _load();
    } catch (e) {
      if (mounted) toast(context, errorText(e));
    }
  }

  Future<void> _delete(Json s) async {
    if (!await confirmDelete(
          context,
          'Delete chat?',
          '“${s['title']}” akan dihapus dari riwayat.',
        ) ||
        !mounted) {
      return;
    }
    try {
      await _api.delete('/ai/sessions/${s['_id']}');
      widget.onDeleted('${s['_id']}');
      if (mounted) await _load();
    } catch (e) {
      if (mounted) toast(context, errorText(e));
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Text('History', style: serifStyle(context, 20)),
      const SizedBox(height: 8),
      Expanded(
        child: _error.isNotEmpty
            ? ErrorRetry(message: _error, onRetry: _load)
            : _items == null
            ? const Loading()
            : _items!.isEmpty
            ? const Empty(title: 'Belum ada percakapan.')
            : ListView(
                children: [
                  for (final s in _items!)
                    ListTile(
                      selected: s['_id'] == widget.current,
                      title: Text(
                        text(s['title']),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      subtitle: Text(
                        [
                          if (s['book'] is Json)
                            text((s['book'] as Json)['judul']),
                          timeAgo(s['updatedAt']),
                        ].join(' · '),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      onTap: () => Navigator.pop(context, '${s['_id']}'),
                      trailing: PopupMenuButton<String>(
                        tooltip: 'More',
                        onSelected: (v) =>
                            v == 'rename' ? _rename(s) : _delete(s),
                        itemBuilder: (_) => const [
                          PopupMenuItem(value: 'rename', child: Text('Rename')),
                          PopupMenuItem(value: 'delete', child: Text('Delete')),
                        ],
                      ),
                    ),
                ],
              ),
      ),
    ],
  );
}

class _PostQuiz extends StatefulWidget {
  const _PostQuiz(this.quiz);
  final Json quiz;
  @override
  State<_PostQuiz> createState() => _PostQuizState();
}

class _PostQuizState extends State<_PostQuiz> {
  late final _judul = TextEditingController(
    text:
        '${widget.quiz['untuk'] == 'guru' ? 'Latihan soal' : 'Kuis'}: ${widget.quiz['judul']}'
            .characters
            .take(200)
            .toString(),
  );
  late final _isi = TextEditingController(
    text:
        'Kerjakan ${jsonList(widget.quiz['questions']).length} soal berikut${text(widget.quiz['jenjang']).isEmpty ? '' : ' (${widget.quiz['jenjang']})'}. Tulis jawabanmu di kolom balasan, misalnya "1. B, 2. C, ...".',
  );
  bool _share = false;
  bool _busy = false;
  String _error = '';

  @override
  void dispose() {
    _judul.dispose();
    _isi.dispose();
    super.dispose();
  }

  Future<void> _post() async {
    final q = widget.quiz;
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      final r = await AppScope.read(context).api.post('/discussions', {
        'judul': _judul.text.trim(),
        'isi': _isi.text.trim(),
        'book': q['book'] is Json ? (q['book'] as Json)['_id'] : '',
        'kuis': {
          for (final k in const [
            'judul',
            'type',
            'level',
            'jenjang',
            'questions',
          ])
            k: q[k],
          'kunciPublik': _share,
        },
      });
      if (mounted) {
        Navigator.pop(context, '${(r['discussion'] as Json)['_id']}');
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = errorText(e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    padding: EdgeInsets.fromLTRB(
      20,
      0,
      20,
      20 + MediaQuery.viewInsetsOf(context).bottom,
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Share questions to Discussion', style: serifStyle(context, 20)),
        const SizedBox(height: 14),
        TextField(
          controller: _judul,
          maxLength: 200,
          decoration: const InputDecoration(labelText: 'Judul'),
        ),
        TextField(
          controller: _isi,
          maxLength: 2000,
          minLines: 3,
          maxLines: 6,
          decoration: const InputDecoration(labelText: 'Petunjuk'),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text(
            'Tampilkan kunci jawaban ke semua pembaca',
            style: TextStyle(fontSize: 14),
          ),
          subtitle: const Text(
            'Biarkan mati kalau soal ini untuk dikerjakan; kamu bisa membagikannya nanti.',
            style: TextStyle(fontSize: 12),
          ),
          value: _share,
          onChanged: (v) => setState(() => _share = v),
        ),
        ErrorBox(_error),
        FilledButton(
          onPressed: _busy ? null : _post,
          child: Text(_busy ? 'Posting…' : 'Post'),
        ),
      ],
    ),
  );
}
