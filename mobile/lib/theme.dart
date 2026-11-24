import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

/// Token warna web (client/src/index.css & tailwind.config.js). Ubah bersamaan.
class Lu extends ThemeExtension<Lu> {
  const Lu({
    required this.ink,
    required this.inkSoft,
    required this.inkMute,
    required this.mist,
    required this.line,
    required this.surface,
    required this.teal,
    required this.tealSoft,
    required this.lanternSoft,
    required this.lanternText,
    required this.danger,
  });

  final Color ink, inkSoft, inkMute, mist, line, surface;
  final Color teal, tealSoft, lanternSoft, lanternText, danger;

  // Tetap di kedua mode.
  static const lantern = Color(0xFFF79319);
  static const onLantern = Color(0xFF1B2B3A);
  static const lamp = Color(0xFFFFC93C);
  static const forest = Color(0xFF2F6667);

  static const light = Lu(
    ink: Color(0xFF143752),
    inkSoft: Color(0xFF3A546B),
    inkMute: Color(0xFF5C7083),
    mist: Color(0xFFF3F6F6),
    line: Color(0xFFDCE4E6),
    surface: Color(0xFFFFFFFF),
    teal: Color(0xFF316B6C),
    tealSoft: Color(0xFFE3F1F0),
    lanternSoft: Color(0xFFFFF1DE),
    lanternText: Color(0xFFA85300),
    danger: Color(0xFFB91C1C),
  );

  static const dark = Lu(
    ink: Color(0xFFE6EDF3),
    inkSoft: Color(0xFFC0CDD8),
    inkMute: Color(0xFF8A9CAD),
    mist: Color(0xFF0B141D),
    line: Color(0xFF293947),
    surface: Color(0xFF131F2A),
    teal: Color(0xFF5CB4B0),
    tealSoft: Color(0xFF163436),
    lanternSoft: Color(0xFF3D2910),
    lanternText: Color(0xFFFFB35C),
    danger: Color(0xFFF87171),
  );

  static Lu of(BuildContext context) => Theme.of(context).extension<Lu>()!;

  @override
  Lu copyWith() => this;

  @override
  Lu lerp(Lu? other, double t) => t < .5 || other == null ? this : other;
}

const serif = 'Literata';

TextStyle serifStyle(BuildContext context, double size) => TextStyle(
  fontFamily: serif,
  fontSize: size,
  // Judul kecil sering terpotong dua baris; 1.25 memangkas kaki huruf (g, p, y).
  height: size < 18 ? 1.45 : 1.25,
  fontWeight: FontWeight.w600,
  color: Lu.of(context).ink,
);

ThemeData buildTheme(Brightness b) {
  final c = b == Brightness.dark ? Lu.dark : Lu.light;
  final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(8));
  const label = TextStyle(
    fontFamily: 'Manrope',
    fontSize: 14,
    fontWeight: FontWeight.w600,
  );
  OutlineInputBorder border(Color color, [double w = 1]) => OutlineInputBorder(
    borderRadius: BorderRadius.circular(8),
    borderSide: BorderSide(color: color, width: w),
  );
  return ThemeData(
    useMaterial3: true,
    brightness: b,
    fontFamily: 'Manrope',
    extensions: [c],
    scaffoldBackgroundColor: c.mist,
    dividerColor: c.line,
    colorScheme: ColorScheme.fromSeed(
      seedColor: Lu.forest,
      brightness: b,
      primary: c.teal,
      onPrimary: b == Brightness.dark ? c.mist : Colors.white,
      secondaryContainer: c.tealSoft,
      onSecondaryContainer: c.ink,
      surface: c.surface,
      onSurface: c.ink,
      onSurfaceVariant: c.inkMute,
      outline: c.line,
      outlineVariant: c.line,
      error: c.danger,
      surfaceTint: Colors.transparent,
    ),
    textTheme: ThemeData(brightness: b).textTheme
        .apply(fontFamily: 'Manrope', bodyColor: c.ink, displayColor: c.ink),
    appBarTheme: AppBarTheme(
      backgroundColor: c.mist,
      foregroundColor: c.ink,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        fontFamily: serif,
        fontSize: 22,
        fontWeight: FontWeight.w600,
        color: c.ink,
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: Lu.lantern,
        foregroundColor: Lu.onLantern,
        shape: shape,
        textStyle: label,
        minimumSize: const Size(48, 48),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: c.ink,
        backgroundColor: c.surface,
        side: BorderSide(color: c.line),
        shape: shape,
        textStyle: label,
        minimumSize: const Size(48, 48),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: c.teal, textStyle: label),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.surface,
      hintStyle: TextStyle(color: c.inkMute, fontSize: 14),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      border: border(c.line),
      enabledBorder: border(c.line),
      focusedBorder: border(c.teal, 2),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: c.surface,
      indicatorColor: c.lanternSoft,
      height: 68,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (s) => TextStyle(
          fontFamily: 'Manrope',
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: s.contains(WidgetState.selected) ? c.ink : c.inkMute,
        ),
      ),
      iconTheme: WidgetStateProperty.resolveWith(
        (s) => IconThemeData(
          color: s.contains(WidgetState.selected) ? c.lanternText : c.inkMute,
        ),
      ),
    ),
    // Warna garis terlalu samar untuk sakelar mati.
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith(
        (s) => s.contains(WidgetState.selected) ? null : c.inkMute,
      ),
      trackOutlineColor: WidgetStateProperty.resolveWith(
        (s) => s.contains(WidgetState.selected) ? null : c.inkMute,
      ),
    ),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
  );
}

/// Lisensi font yang dibundel.
void registerFontLicenses() {
  LicenseRegistry.addLicense(() async* {
    for (final f in const ['Manrope', 'Literata']) {
      yield LicenseEntryWithLineBreaks([
        f,
      ], await rootBundle.loadString('assets/fonts/OFL-$f.txt'));
    }
  });
}
