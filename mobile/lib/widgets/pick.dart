import 'dart:async';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';

import '../api.dart';

const mb = 1024 * 1024;

const _types = {
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'webp': 'image/webp',
  'gif': 'image/gif',
  'heic': 'image/heic',
  'heif': 'image/heif',
  'pdf': 'application/pdf',
  'txt': 'text/plain',
  'md': 'text/markdown',
  'csv': 'text/csv',
  'mp4': 'video/mp4',
  'mpeg': 'video/mpeg',
  'mov': 'video/quicktime',
  'webm': 'video/webm',
  '3gp': 'video/3gpp',
  'mp3': 'audio/mpeg',
  'wav': 'audio/wav',
  'ogg': 'audio/ogg',
  'aac': 'audio/aac',
  'flac': 'audio/flac',
  'm4a': 'audio/mp4',
};

String? typeOf(String name) =>
    _types[name.contains('.') ? name.split('.').last.toLowerCase() : ''];

FormFile fileOf(String path, {String? name, String? type}) {
  final n = name ?? path.split(RegExp(r'[/\\]')).last;
  return FormFile(
    field: '',
    path: path,
    name: n,
    type: type ?? typeOf(n) ?? 'application/octet-stream',
    size: File(path).lengthSync(),
  );
}

/// Foto dari galeri, diperkecil (Vercel menolak body di atas 4,5 MB).
Future<FormFile?> pickPhoto({double side = 1600, int maxBytes = 4 * mb}) async {
  final x = await ImagePicker().pickImage(
    source: ImageSource.gallery,
    maxWidth: side,
    maxHeight: side,
    imageQuality: 85,
    requestFullMetadata: false,
  );
  if (x == null) return null;
  final f = fileOf(x.path, name: x.name);
  if (!const {
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
  }.contains(f.type)) {
    throw ApiException(0, 'Gambar harus JPG, PNG, WEBP, atau GIF.');
  }
  if (f.size > maxBytes) {
    throw ApiException(
      0,
      'Ukuran gambar masih lebih dari ${maxBytes ~/ mb} MB. Pilih gambar yang lebih kecil.',
    );
  }
  return f;
}

Future<FormFile?> pickPdf() async {
  final x = await FilePicker.pickFile(
    type: FileType.custom,
    allowedExtensions: const ['pdf'],
  );
  if (x == null) return null;
  final path = x.path;
  if (path == null || !x.name.toLowerCase().endsWith('.pdf')) {
    throw ApiException(0, 'File buku harus PDF.');
  }
  return fileOf(path, name: x.name, type: 'application/pdf');
}

/// Lampiran LUMA.
Future<List<FormFile>> pickAttachments() async {
  final list = await FilePicker.pickFiles(
    type: FileType.custom,
    allowedExtensions: _types.keys.toList(),
  );
  return [
    for (final x in list)
      if (x.path != null && typeOf(x.name) != null)
        fileOf(x.path!, name: x.name)
      else
        throw ApiException(0, '${x.name}: jenis file ini belum didukung LUMA.'),
  ];
}
