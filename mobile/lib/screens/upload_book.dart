import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdfrx/pdfrx.dart';

import '../api.dart';
import '../config.dart';
import '../format.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/book.dart';
import '../widgets/pick.dart';
import '../widgets/ui.dart';

const _keys = [
  'judul',
  'penulis',
  'penerbit',
  'tahunTerbit',
  'isbn',
  'edisi',
  'bahasa',
  'deskripsi',
  'sumber',
  'sumberUrl',
  'lisensi',
];

/// Sampul dari halaman pertama PDF. Melempar bila PDF rusak / terkunci.
Future<FormFile> coverFromPdf(FormFile pdf) async {
  final doc = await PdfDocument.openFile(pdf.path, useProgressiveLoading: true);
  try {
    final page = doc.pages.first;
    final w = 600.0, h = 600.0 * page.height / page.width;
    final raw = await page.render(
      fullWidth: w,
      fullHeight: h,
      backgroundColor: 0xffffffff,
    );
    final img = await raw!.createImage();
    raw.dispose();
    final png = await img.toByteData(format: ui.ImageByteFormat.png);
    img.dispose();
    final f = File(
      '${(await getTemporaryDirectory()).path}/sampul-${DateTime.now().millisecondsSinceEpoch}.png',
    );
    await f.writeAsBytes(png!.buffer.asUint8List());
    return fileOf(f.path, name: 'sampul.png', type: 'image/png');
  } finally {
    await doc.dispose();
  }
}

/// Unggah buku baru, atau ubah buku [id]. Mengembalikan true bila tersimpan.
class UploadBookScreen extends StatefulWidget {
  const UploadBookScreen({super.key, this.id});
  final String? id;
  @override
  State<UploadBookScreen> createState() => _UploadBookScreenState();
}

class _UploadBookScreenState extends State<UploadBookScreen> {
  final _c = {for (final k in _keys) k: TextEditingController()};
  List<String> _categories = [];
  String _category = 'Umum';
  Json? _existing;
  FormFile? _pdf;
  FormFile? _cover;
  bool _autoCover = false;
  late bool _rights = widget.id != null;
  bool _busy = false;
  bool _reading = false;
  double _progress = 0;
  String _error = '';
  String _loadError = '';

  bool get _edit => widget.id != null;

  @override
  void initState() {
    super.initState();
    _c['bahasa']!.text = 'Indonesia';
    _load();
  }

  @override
  void dispose() {
    for (final c in _c.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    final api = AppScope.read(context).api;
    api.get('/books/categories').then((r) {
      if (mounted) {
        setState(
          () => _categories = [
            for (final k in jsonList(r['categories'])) '${k['name']}',
          ],
        );
      }
    }, onError: (_) {});
    if (!_edit) return;
    try {
      final b = (await api.get('/books/${widget.id}'))['book'] as Json;
      if (!mounted) return;
      if (b['canEdit'] != true) {
        toast(context, 'Kamu tidak bisa mengubah buku ini.');
        return Navigator.pop(context);
      }
      setState(() {
        _existing = b;
        _loadError = '';
        _category = text(b['kategori']);
        for (final e in _c.entries) {
          e.value.text = text(b[e.key]);
        }
      });
    } catch (e) {
      if (mounted) setState(() => _loadError = errorText(e));
    }
  }

  Future<void> _pickPdf() async {
    setState(() => _error = '');
    try {
      final f = await pickPdf();
      if (f == null || !mounted) return;
      setState(() {
        _pdf = f;
        _reading = true;
        if (_c['judul']!.text.isEmpty) {
          _c['judul']!.text = f.name
              .replaceAll(RegExp(r'\.pdf$', caseSensitive: false), '')
              .replaceAll(RegExp('[_-]+'), ' ')
              .trim();
        }
      });
      // Sekaligus memeriksa PDF bisa dibuka.
      try {
        final cover = await coverFromPdf(f);
        if (!mounted || _pdf != f) return;
        final keep =
            (_cover != null && !_autoCover) ||
            text(_existing?['cover']).isNotEmpty;
        if (!keep) {
          setState(() {
            _cover = cover;
            _autoCover = true;
          });
        }
      } catch (_) {
        if (!mounted) return;
        setState(() {
          _pdf = null;
          _error = 'PDF tidak bisa dibuka. Pastikan file tidak rusak atau terkunci password.';
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
    if (mounted) setState(() => _reading = false);
  }

  Future<void> _pickCover() async {
    try {
      final f = await pickPhoto(maxBytes: 5 * mb);
      if (f != null && mounted) {
        setState(() {
          _cover = f;
          _autoCover = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
  }

  Future<void> _submit() async {
    String? salah;
    if (!_edit && _pdf == null) salah = 'Pilih file PDF bukunya dulu.';
    if (_c['judul']!.text.trim().isEmpty) salah ??= 'Judul wajib diisi.';
    if (_c['penulis']!.text.trim().isEmpty) salah ??= 'Penulis wajib diisi.';
    if (!_rights) salah ??= 'Centang pernyataan hak unggah terlebih dahulu.';
    if (salah != null) return setState(() => _error = salah!);
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = '';
      _progress = 0;
    });
    try {
      final r = await saveBook(
        AppScope.read(context).api,
        id: widget.id,
        fields: {
          for (final e in _c.entries) e.key: e.value.text.trim(),
          'kategori': _category,
        },
        pdf: _pdf,
        cover: _cover,
        onProgress: (p) {
          if (mounted) setState(() => _progress = p);
        },
      );
      if (!mounted) return;
      toast(
        context,
        (r['book'] as Json)['status'] == 'disetujui'
            ? 'Buku tersimpan dan sudah tayang.'
            : 'Buku terkirim. Admin akan meninjaunya.',
      );
      Navigator.pop(context, true);
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
  Widget build(BuildContext context) => PopScope(
    // Jangan tinggalkan unggahan setengah jalan tanpa sengaja.
    canPop: !_busy,
    child: Scaffold(
      appBar: AppBar(title: Text(_edit ? 'Edit book' : 'Upload book')),
      body: _loadError.isNotEmpty
          ? ErrorRetry(message: _loadError, onRetry: _load)
          : _edit && _existing == null
          ? const Loading()
          : _form(context),
    ),
  );

  Widget _form(BuildContext context) {
    final c = Lu.of(context);
    final admin = AppScope.of(context).isAdmin;
    final note = text(_existing?['catatanReview']);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
      children: [
        Text(
          admin
              ? 'Sebagai admin, buku yang kamu simpan langsung tayang.'
              : _edit
              ? 'Setelah disimpan, buku akan ditinjau ulang oleh admin.'
              : 'Buku akan tayang setelah ditinjau admin.',
          style: TextStyle(color: c.inkMute),
        ),
        if (note.isNotEmpty && _existing?['status'] != 'disetujui')
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Panel(child: Text('Catatan admin: $note')),
          ),
        const SizedBox(height: 16),
        Panel(
          onTap: _busy || _reading ? null : _pickPdf,
          child: Row(
            children: [
              Icon(Icons.picture_as_pdf_outlined, size: 30, color: c.teal),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _pdf?.name ?? 'Choose PDF file',
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    Text(
                      _reading
                          ? 'Membaca PDF…'
                          : _pdf != null
                          ? formatSize(_pdf!.size)
                          : _edit
                          ? 'Kosongkan bila tidak diganti.'
                          : 'PDF berteks (bukan hasil scan) membuat LUMA bisa membacanya.',
                      style: TextStyle(fontSize: 12, color: c.inkMute),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        Center(
          child: SizedBox(
            width: 140,
            child: _cover != null
                ? AspectRatio(
                    aspectRatio: 2 / 3,
                    child: Image.file(
                      File(_cover!.path),
                      fit: BoxFit.cover,
                      cacheWidth: 500,
                    ),
                  )
                : BookCover(
                    _existing ??
                        {
                          'judul': _c['judul']!.text.isEmpty
                              ? 'Judul buku'
                              : _c['judul']!.text,
                          'penulis': _c['penulis']!.text,
                        },
                  ),
          ),
        ),
        if (_autoCover)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              'Sampul diambil dari halaman pertama PDF.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: c.inkMute),
            ),
          ),
        TextButton.icon(
          icon: const Icon(Icons.image_outlined),
          label: const Text('Choose cover'),
          onPressed: _busy ? null : _pickCover,
        ),
        const SizedBox(height: 8),
        _field('judul', 'Judul', 200),
        _field('penulis', 'Penulis', 150),
        Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: DropdownButtonFormField<String>(
            key: ValueKey('$_category-${_categories.length}'),
            initialValue: _category,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Kategori'),
            items: [
              for (final k in {..._categories, _category})
                DropdownMenuItem(
                  value: k,
                  child: Text(k, overflow: TextOverflow.ellipsis),
                ),
            ],
            onChanged: (v) => setState(() => _category = v!),
          ),
        ),
        _field('penerbit', 'Penerbit', 150),
        _field('tahunTerbit', 'Tahun terbit', 4, number: true),
        _field('isbn', 'ISBN', 30),
        _field('edisi', 'Edisi', 50),
        _field('bahasa', 'Bahasa', 40),
        _field(
          'sumber',
          'Sumber (opsional)',
          150,
          hint: 'Mis. Karya sendiri, SIBI Kemendikdasmen',
        ),
        _field(
          'sumberUrl',
          'Tautan sumber (opsional)',
          500,
          hint: 'https://',
          url: true,
        ),
        _field(
          'lisensi',
          'Lisensi (opsional)',
          150,
          hint: 'Mis. CC BY 4.0, Domain publik',
        ),
        _field('deskripsi', 'Deskripsi', 3000, lines: 4),
        if (!_edit) ...[
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: _rights,
            onChanged: (v) => setState(() => _rights = v == true),
            title: const Text(
              'Saya memiliki hak atau izin untuk membagikan buku ini secara gratis, dan isinya tidak melanggar Terms.',
              style: TextStyle(fontSize: 14),
            ),
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: () => openLink(context, '$webBase/ketentuan'),
              child: const Text('Terms'),
            ),
          ),
        ],
        ErrorBox(_error),
        if (_busy) ...[
          LinearProgressIndicator(
            value: _progress > 0 && _progress < 1 ? _progress : null,
            color: Lu.lantern,
            minHeight: 8,
            borderRadius: BorderRadius.circular(4),
          ),
          const SizedBox(height: 6),
          Text(
            _progress >= 1
                ? 'Memproses PDF…'
                : 'Mengunggah ${(_progress * 100).floor()}%',
            style: TextStyle(fontSize: 12, color: c.inkMute),
          ),
          const SizedBox(height: 12),
        ],
        FilledButton(
          onPressed: _busy || _reading ? null : _submit,
          child: Text(
            _busy
                ? 'Saving…'
                : _edit
                ? 'Save changes'
                : admin
                ? 'Save & publish'
                : 'Submit for review',
          ),
        ),
      ],
    );
  }

  Widget _field(
    String key,
    String label,
    int max, {
    String? hint,
    int lines = 1,
    bool number = false,
    bool url = false,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: TextField(
      controller: _c[key],
      maxLength: max,
      minLines: lines,
      maxLines: lines == 1 ? 1 : 10,
      keyboardType: number
          ? TextInputType.number
          : url
          ? TextInputType.url
          : null,
      inputFormatters: [if (number) FilteringTextInputFormatter.digitsOnly],
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        counterText: '',
        alignLabelWithHint: true,
      ),
    ),
  );
}
