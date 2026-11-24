import 'api.dart';

const _bulan = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

String formatDate(Object? v) {
  final d = DateTime.tryParse('$v')?.toLocal();
  return d == null ? '' : '${d.day} ${_bulan[d.month - 1]} ${d.year}';
}

String timeAgo(Object? v, {DateTime? now}) {
  final d = DateTime.tryParse('$v');
  if (d == null) return '';
  final s = (now ?? DateTime.now()).difference(d).inSeconds;
  if (s < 60) return 'baru saja';
  if (s < 3600) return '${s ~/ 60} menit lalu';
  if (s < 86400) return '${s ~/ 3600} jam lalu';
  if (s < 86400 * 30) return '${s ~/ 86400} hari lalu';
  return formatDate(v);
}

String formatSize(num b) => b > 1048576
    ? '${(b / 1048576).toStringAsFixed(1)} MB'
    : '${(b / 1024).round().clamp(1, 1024)} KB';

String displayName(Json? u) {
  for (final k in const ['namaLengkap', 'username']) {
    final v = u?[k];
    if (v is String && v.isNotEmpty) return v;
  }
  return 'Pengguna';
}

/// Teks dari data API; kosong bila tidak ada.
String text(Object? v) => v == null ? '' : '$v';

List<Json> jsonList(Object? v) => [
  for (final e in v is List ? v : const [])
    if (e is Json) e,
];

const statusLabel = {
  'menunggu': 'Menunggu tinjauan',
  'disetujui': 'Tayang',
  'ditolak': 'Ditolak',
  'revisi': 'Perlu revisi',
};
