import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import 'package:share_plus/share_plus.dart';

import '../api.dart';
import '../format.dart';
import '../theme.dart';
import 'ui.dart';

const _letters = 'ABCDEF';
const _green = Color(0xFF10B981);

String _letter(Json q) {
  final i = _options(q).indexOf(text(q['answer']));
  return i >= 0 && i < _letters.length ? '${_letters[i]}. ' : '';
}

List<String> _options(Json q) => [
  for (final o in q['options'] is List ? q['options'] as List : const []) '$o',
];

String _meta(Json quiz) => [
  text(quiz['jenjang']),
  if (text(quiz['level']).isNotEmpty) 'tingkat ${quiz['level']}',
  '${jsonList(quiz['questions']).length} soal',
].where((s) => s.isNotEmpty).join(' · ');

/// Teks polos lembar soal.
String sheetText(Json quiz, {bool withKey = false}) {
  final qs = jsonList(quiz['questions']);
  final b = StringBuffer('${text(quiz['judul'])}\n${_meta(quiz)}\n');
  for (final (i, q) in qs.indexed) {
    b.write('\n${i + 1}. ${q['question']}\n');
    if (q['type'] == 'pilihan') {
      for (final (j, o) in _options(q).indexed) {
        b.write('   ${_letters[j]}. $o\n');
      }
    } else if (q['type'] == 'esai') {
      b.write('   ________________________________\n');
    }
  }
  if (!withKey) return '$b'.trimRight();
  b.write('\n— Kunci jawaban —\n');
  for (final (i, q) in qs.indexed) {
    b.write(
      '${i + 1}. ${q['type'] == 'pilihan' ? _letter(q) : ''}${q['answer']}\n',
    );
    if (text(q['explanation']).isNotEmpty) b.write('   ${q['explanation']}\n');
  }
  return '$b'.trimRight();
}

/// Penilaian isian: abaikan huruf besar, tanda baca, dan spasi ganda.
String normalizeAnswer(String s) =>
    s.toLowerCase().replaceAll(RegExp('[^a-z0-9À-ɏ]+'), ' ').trim();

bool isCorrect(Json q, String? answer) {
  if (answer == null) return false;
  if (q['type'] == 'pilihan') return answer == text(q['answer']);
  final a = normalizeAnswer(answer);
  return a.isNotEmpty && a == normalizeAnswer(text(q['answer']));
}

/// Kuis latihan dengan nilai otomatis.
class QuizCard extends StatefulWidget {
  const QuizCard(this.quiz, {super.key, this.onPost});
  final Json quiz;
  final VoidCallback? onPost;
  @override
  State<QuizCard> createState() => _QuizCardState();
}

class _QuizCardState extends State<QuizCard> {
  final _answers = <int, String>{};
  bool _checked = false;
  int _round = 0;

  @override
  Widget build(BuildContext context) {
    final c = Lu.of(context);
    final qs = jsonList(widget.quiz['questions']);
    final score = [
      for (final (i, q) in qs.indexed)
        if (isCorrect(q, _answers[i])) q,
    ].length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Kuis ${widget.quiz['type'] == 'pilihan' ? 'pilihan ganda' : 'isian'} · tingkat ${widget.quiz['level']} · ${widget.quiz['judul']}',
          style: TextStyle(color: c.inkSoft),
        ),
        for (final (i, q) in qs.indexed) _question(context, i, q),
        const SizedBox(height: 12),
        if (!_checked)
          FilledButton.icon(
            icon: const Icon(Icons.check),
            label: const Text('Check answers'),
            onPressed: _answers.isEmpty
                ? null
                : () => setState(() => _checked = true),
          )
        else ...[
          Text('Skor $score/${qs.length}', style: serifStyle(context, 20)),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            icon: const Icon(Icons.refresh),
            label: const Text('Retry'),
            onPressed: () => setState(() {
              _answers.clear();
              _checked = false;
              _round++;
            }),
          ),
        ],
        if (widget.onPost != null)
          TextButton.icon(
            icon: const Icon(Icons.forum_outlined),
            label: const Text('Share to Discussion'),
            onPressed: widget.onPost,
          ),
      ],
    );
  }

  Widget _question(BuildContext context, int i, Json q) {
    final c = Lu.of(context);
    final ok = isCorrect(q, _answers[i]);
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: c.mist,
        border: Border.all(color: c.line),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '${i + 1}. ${q['question']}',
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 10),
          if (q['type'] == 'pilihan')
            for (final o in _options(q)) _option(context, i, q, o)
          else
            TextField(
              key: ValueKey('$_round-$i'),
              enabled: !_checked,
              decoration: const InputDecoration(hintText: 'Jawabanmu'),
              onChanged: (v) => setState(() => _answers[i] = v),
            ),
          if (_checked) ...[
            const SizedBox(height: 8),
            Text(
              ok ? 'Benar.' : 'Jawaban: ${q['answer']}',
              style: TextStyle(
                fontWeight: FontWeight.w600,
                color: ok ? _green : c.danger,
              ),
            ),
            if (text(q['explanation']).isNotEmpty)
              Text(text(q['explanation']), style: TextStyle(color: c.inkSoft)),
          ],
        ],
      ),
    );
  }

  Widget _option(BuildContext context, int i, Json q, String o) {
    final c = Lu.of(context);
    final picked = _answers[i] == o;
    final right = _checked && o == text(q['answer']);
    final wrong = _checked && picked && !right;
    final color = right
        ? _green
        : wrong
        ? c.danger
        : picked
        ? c.teal
        : c.line;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Semantics(
        inMutuallyExclusiveGroup: true,
        checked: picked,
        child: Material(
          color: color == c.line ? c.surface : color.withValues(alpha: .12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
            side: BorderSide(color: color),
          ),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: _checked ? null : () => setState(() => _answers[i] = o),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  Icon(
                    picked
                        ? Icons.radio_button_checked
                        : Icons.radio_button_off,
                    size: 20,
                    color: picked ? c.teal : c.inkMute,
                  ),
                  const SizedBox(width: 10),
                  Expanded(child: Text(o)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Daftar soal; kunci tampil bila [showKey].
class _Questions extends StatelessWidget {
  const _Questions(this.questions, {required this.showKey});
  final List<Json> questions;
  final bool showKey;

  @override
  Widget build(BuildContext context) {
    final c = Lu.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final (i, q) in questions.indexed)
          Padding(
            padding: const EdgeInsets.only(top: 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('${i + 1}. ${q['question']}'),
                if (q['type'] == 'pilihan')
                  for (final (j, o) in _options(q).indexed)
                    Padding(
                      padding: const EdgeInsets.only(left: 20, top: 3),
                      child: Text(
                        '${_letters[j]}. $o',
                        style: TextStyle(
                          color: c.inkSoft,
                          fontWeight: showKey && o == text(q['answer'])
                              ? FontWeight.w700
                              : null,
                        ),
                      ),
                    ),
                if (showKey && text(q['answer']).isNotEmpty)
                  Container(
                    margin: const EdgeInsets.only(top: 8),
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: _green.withValues(alpha: .1),
                      border: const Border(
                        left: BorderSide(color: _green, width: 4),
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${q['type'] == 'pilihan' ? _letter(q) : ''}${q['answer']}',
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                        if (text(q['explanation']).isNotEmpty)
                          Text(
                            text(q['explanation']),
                            style: TextStyle(color: c.inkSoft),
                          ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}

Future<void> _copy(BuildContext context, String s) async {
  await Clipboard.setData(ClipboardData(text: s));
  if (context.mounted) toast(context, 'Disalin.');
}

void _shareText(String title, String s) =>
    SharePlus.instance.share(ShareParams(subject: title, text: s));

/// Lembar soal + kunci jawaban (mode guru).
class QuizSheet extends StatefulWidget {
  const QuizSheet(this.quiz, {super.key, this.onPost});
  final Json quiz;
  final VoidCallback? onPost;
  @override
  State<QuizSheet> createState() => _QuizSheetState();
}

class _QuizSheetState extends State<QuizSheet> {
  bool _key = false;

  @override
  Widget build(BuildContext context) {
    final q = widget.quiz;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(text(q['judul']), style: serifStyle(context, 18)),
        Text(_meta(q), style: TextStyle(color: Lu.of(context).inkMute)),
        _Questions(jsonList(q['questions']), showKey: _key),
        const SizedBox(height: 14),
        Wrap(
          spacing: 8,
          children: [
            TextButton(
              onPressed: () => setState(() => _key = !_key),
              child: Text(_key ? 'Hide answer key' : 'Show answer key'),
            ),
            TextButton(
              onPressed: () => _copy(context, sheetText(q)),
              child: const Text('Copy questions'),
            ),
            TextButton(
              onPressed: () => _copy(context, sheetText(q, withKey: true)),
              child: const Text('Copy with answer key'),
            ),
            TextButton(
              onPressed: () => _shareText(text(q['judul']), sheetText(q)),
              child: const Text('Share questions'),
            ),
            if (widget.onPost != null)
              TextButton(
                onPressed: widget.onPost,
                child: const Text('Share to Discussion'),
              ),
          ],
        ),
      ],
    );
  }
}

/// Lembar soal di halaman diskusi (kunci hanya bila boleh dilihat).
class DiscussionQuiz extends StatefulWidget {
  const DiscussionQuiz(this.kuis, {super.key, required this.onToggleShare});
  final Json kuis;
  final ValueChanged<bool> onToggleShare;
  @override
  State<DiscussionQuiz> createState() => _DiscussionQuizState();
}

class _DiscussionQuizState extends State<DiscussionQuiz> {
  bool _key = false;

  @override
  Widget build(BuildContext context) {
    final k = widget.kuis;
    final c = Lu.of(context);
    final kunci = jsonList(k['kunci']);
    final qs = [
      for (final (i, s) in jsonList(k['soal']).indexed)
        {...s, if (i < kunci.length) ...kunci[i]},
    ];
    final can = k['bisaLihatKunci'] == true;
    final jenjang = text(k['jenjang']);
    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Lembar soal · ${qs.length} soal${jenjang.isEmpty ? '' : ' · $jenjang'}. Tulis jawabanmu di balasan.',
            style: TextStyle(color: c.inkMute),
          ),
          _Questions(qs, showKey: can && _key),
          const SizedBox(height: 10),
          if (can)
            TextButton(
              onPressed: () => setState(() => _key = !_key),
              child: Text(_key ? 'Hide answer key' : 'Show answer key'),
            )
          else
            Text(
              'Kunci jawaban disimpan oleh pembuat soal.',
              style: TextStyle(fontSize: 12, color: c.inkMute),
            ),
          TextButton(
            onPressed: () => _shareText(
              text(k['judul']),
              sheetText({...k, 'questions': qs}, withKey: can && _key),
            ),
            child: const Text('Share questions'),
          ),
          if (k['pemilik'] == true)
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text(
                'Bagikan kunci ke semua pembaca',
                style: TextStyle(fontSize: 14),
              ),
              value: k['kunciPublik'] == true,
              onChanged: widget.onToggleShare,
            ),
        ],
      ),
    );
  }
}
