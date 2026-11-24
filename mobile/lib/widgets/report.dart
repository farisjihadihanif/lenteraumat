import 'package:material_ui/material_ui.dart';

import '../nav.dart';
import '../state.dart';
import '../theme.dart';
import 'ui.dart';

const _reasons = {
  'spam': 'Spam atau promosi',
  'tidak_pantas': 'Kasar, menghina, atau tidak pantas',
  'hak_cipta': 'Melanggar hak cipta',
  'salah_informasi': 'Informasi keliru atau menyesatkan',
  'lainnya': 'Lainnya',
};

/// Laporkan 'book' | 'discussion' | 'comment' | 'review' milik orang lain.
class ReportButton extends StatelessWidget {
  const ReportButton({
    super.key,
    required this.type,
    required this.id,
    this.ownerId,
  });
  final String type;
  final String id;
  final Object? ownerId;

  @override
  Widget build(BuildContext context) {
    if (AppScope.of(context).isMe(ownerId)) return const SizedBox.shrink();
    return TextButton.icon(
      style: TextButton.styleFrom(foregroundColor: Lu.of(context).inkMute),
      icon: const Icon(Icons.flag_outlined, size: 16),
      label: const Text('Report'),
      onPressed: () async {
        if (!await requireLogin(context) || !context.mounted) return;
        final pesan = await showModalBottomSheet<String>(
          context: context,
          isScrollControlled: true,
          useSafeArea: true,
          showDragHandle: true,
          builder: (_) => _ReportSheet(type: type, id: id),
        );
        if (pesan != null && context.mounted) toast(context, pesan);
      },
    );
  }
}

class _ReportSheet extends StatefulWidget {
  const _ReportSheet({required this.type, required this.id});
  final String type;
  final String id;
  @override
  State<_ReportSheet> createState() => _ReportSheetState();
}

class _ReportSheetState extends State<_ReportSheet> {
  final _note = TextEditingController();
  String _reason = '';
  String _error = '';
  bool _busy = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      final r = await AppScope.read(context).api.post('/reports', {
        'targetType': widget.type,
        'target': widget.id,
        'alasan': _reason,
        'catatan': _note.text.trim(),
      });
      if (mounted) Navigator.pop(context, '${r['message']}');
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
        Text('Report', style: serifStyle(context, 20)),
        const SizedBox(height: 8),
        const Text('Apa masalahnya?'),
        for (final e in _reasons.entries)
          ListTile(
            contentPadding: EdgeInsets.zero,
            selected: _reason == e.key,
            leading: Icon(
              _reason == e.key
                  ? Icons.radio_button_checked
                  : Icons.radio_button_off,
            ),
            title: Text(e.value, style: const TextStyle(fontSize: 14)),
            onTap: () => setState(() => _reason = e.key),
          ),
        TextField(
          controller: _note,
          maxLength: 1000,
          minLines: 2,
          maxLines: 5,
          decoration: InputDecoration(
            hintText: _reason == 'hak_cipta'
                ? 'Sebutkan pemilik hak cipta dan kontakmu'
                : _reason == 'lainnya'
                ? 'Jelaskan singkat alasannya'
                : 'Keterangan (opsional)',
          ),
        ),
        ErrorBox(_error),
        FilledButton(
          onPressed: _busy || _reason.isEmpty ? null : _submit,
          child: Text(_busy ? 'Sending…' : 'Submit report'),
        ),
      ],
    ),
  );
}
