import 'dart:io';

import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../format.dart';
import '../state.dart';
import '../widgets/book_picker.dart';
import '../widgets/pick.dart';
import '../widgets/ui.dart';

/// Tulis / ubah diskusi. Mengembalikan id diskusi yang tersimpan.
class DiscussionFormScreen extends StatefulWidget {
  const DiscussionFormScreen({super.key, this.edit, this.book});
  final Json? edit;
  final Json? book;
  @override
  State<DiscussionFormScreen> createState() => _DiscussionFormScreenState();
}

class _DiscussionFormScreenState extends State<DiscussionFormScreen> {
  late final _judul = TextEditingController(text: text(widget.edit?['judul']));
  late final _isi = TextEditingController(text: text(widget.edit?['isi']));
  late Json? _book =
      widget.book ??
      (widget.edit?['book'] is Json ? widget.edit!['book'] as Json : null);
  FormFile? _foto;
  bool _busy = false;
  String _error = '';

  @override
  void dispose() {
    _judul.dispose();
    _isi.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = '';
    });
    final id = widget.edit?['_id'];
    try {
      final r = await AppScope.read(context).api.form(
        id == null ? 'POST' : 'PATCH',
        id == null ? '/discussions' : '/discussions/$id',
        fields: {
          'judul': _judul.text.trim(),
          'isi': _isi.text.trim(),
          'book': text(_book?['_id']),
        },
        files: [if (_foto != null) _foto!.as('gambar')],
      );
      if (!mounted) return;
      toast(context, id == null ? 'Diskusi dimulai.' : 'Diskusi diperbarui.');
      Navigator.pop(context, '${(r['discussion'] as Json)['_id']}');
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
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(widget.edit == null ? 'Start discussion' : 'Edit discussion'),
    ),
    body: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        TextField(
          controller: _judul,
          maxLength: 200,
          decoration: const InputDecoration(
            labelText: 'Judul',
            hintText: 'Contoh: Apa makna sabar di bab 2?',
          ),
        ),
        const SizedBox(height: 8),
        if (_book == null)
          OutlinedButton.icon(
            icon: const Icon(Icons.menu_book_outlined),
            label: const Text('Choose a book (optional)'),
            onPressed: () async {
              final b = await pickBook(context);
              if (b != null && mounted) setState(() => _book = b);
            },
          )
        else
          BookLine(
            _book!,
            trailing: IconButton(
              tooltip: 'Remove book',
              icon: const Icon(Icons.close),
              onPressed: () => setState(() => _book = null),
            ),
          ),
        const SizedBox(height: 16),
        TextField(
          controller: _isi,
          maxLength: 20000,
          minLines: 8,
          maxLines: 20,
          decoration: const InputDecoration(
            labelText: 'Isi',
            alignLabelWithHint: true,
            hintText: 'Tulis pertanyaan, pendapat, atau catatanmu.',
            helperText: 'Mendukung Markdown sederhana: **tebal**, *miring*, daftar dengan tanda -.',
            helperMaxLines: 3,
          ),
        ),
        const SizedBox(height: 16),
        if (_foto != null)
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Image.file(
              File(_foto!.path),
              height: 180,
              fit: BoxFit.cover,
              cacheWidth: 1000,
            ),
          ),
        TextButton.icon(
          icon: const Icon(Icons.image_outlined),
          label: Text(_foto == null ? 'Add image (optional)' : 'Remove image'),
          onPressed: () async {
            if (_foto != null) return setState(() => _foto = null);
            try {
              final f = await pickPhoto();
              if (f != null && mounted) setState(() => _foto = f);
            } catch (e) {
              if (context.mounted) toast(context, errorText(e));
            }
          },
        ),
        ErrorBox(_error),
        FilledButton(
          onPressed: _busy ? null : _submit,
          child: Text(
            _busy
                ? 'Saving…'
                : widget.edit == null
                ? 'Publish discussion'
                : 'Save changes',
          ),
        ),
      ],
    ),
  );
}
