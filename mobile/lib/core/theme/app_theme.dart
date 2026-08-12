// نظام تصميم "Yalla Velocity" لتطبيق الموبايل (Flutter).
// مستخرَج من design/stitch/.../yalla_velocity/DESIGN.md.
// يوفّر ThemeData موحّدة تُطبَّق على كامل التطبيق: برتقالي (السرعة) + أزرق سماوي (الثقة)،
// خطّ IBM Plex Sans Arabic، حوافّ ناعمة، وأزرار على شكل حبّة (pill).

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// ألوان علامة يلا (Velocity) — مصدر واحد للألوان.
class YallaColors {
  // الأساسي: برتقالي (الطاقة والسرعة)
  static const primary = Color(0xFFFF6B00);
  static const primaryDeep = Color(0xFFA04100);
  static const onPrimary = Color(0xFFFFFFFF);
  static const primaryContainer = Color(0xFFFFDBCC);
  static const onPrimaryContainer = Color(0xFF572000);

  // الثانوي: أزرق سماوي (الثقة والمسارات)
  static const secondary = Color(0xFF00A2FD);
  static const secondaryDeep = Color(0xFF00629D);
  static const onSecondary = Color(0xFFFFFFFF);
  static const secondaryContainer = Color(0xFFCFE5FF);
  static const onSecondaryContainer = Color(0xFF003558);

  // الأسطح والنصوص
  static const surface = Color(0xFFF9F9FC);
  static const surfaceContainer = Color(0xFFEEEEF0);
  static const card = Color(0xFFFFFFFF);
  static const onSurface = Color(0xFF1A1C1E);
  static const onSurfaceVariant = Color(0xFF5A4136);
  static const muted = Color(0xFF6B6F76);
  static const outline = Color(0xFFD8D2CE);

  // الحالات
  static const error = Color(0xFFBA1A1A);
  static const onError = Color(0xFFFFFFFF);
  static const errorContainer = Color(0xFFFFDAD6);
  static const success = Color(0xFF1F9D55);

  // ألوان حالة الطلب (رمادي=انتظار، أزرق=مُسنَد، برتقالي=جارٍ، أخضر=مسلّم، أحمر=ملغى)
  static const statusPending = Color(0xFF8A8F98);
  static const statusAssigned = secondary;
  static const statusInTransit = primary;
  static const statusDelivered = success;
  static const statusCancelled = error;
}

/// يبني ThemeData الخاصّة بيلا (فاتحة، Material 3).
ThemeData buildYallaTheme() {
  // نبدأ من مخطّط مُولَّد سليم ثم نفرض ألوان العلامة الدقيقة.
  final scheme = ColorScheme.fromSeed(
    seedColor: YallaColors.primary,
    brightness: Brightness.light,
  ).copyWith(
    primary: YallaColors.primary,
    onPrimary: YallaColors.onPrimary,
    primaryContainer: YallaColors.primaryContainer,
    onPrimaryContainer: YallaColors.onPrimaryContainer,
    secondary: YallaColors.secondary,
    onSecondary: YallaColors.onSecondary,
    secondaryContainer: YallaColors.secondaryContainer,
    onSecondaryContainer: YallaColors.onSecondaryContainer,
    surface: YallaColors.surface,
    onSurface: YallaColors.onSurface,
    onSurfaceVariant: YallaColors.onSurfaceVariant,
    outline: YallaColors.outline,
    error: YallaColors.error,
    onError: YallaColors.onError,
    errorContainer: YallaColors.errorContainer,
  );

  final base = ThemeData(useMaterial3: true, colorScheme: scheme);
  const pill = StadiumBorder();

  return base.copyWith(
    scaffoldBackgroundColor: YallaColors.surface,
    textTheme: GoogleFonts.ibmPlexSansArabicTextTheme(base.textTheme),

    // شريط علوي مسطّح على لون السطح (إحساس نظيف وزجاجي)
    appBarTheme: const AppBarTheme(
      backgroundColor: YallaColors.surface,
      foregroundColor: YallaColors.onSurface,
      elevation: 0,
      scrolledUnderElevation: 0.5,
      centerTitle: true,
      titleTextStyle: TextStyle(
        color: YallaColors.onSurface,
        fontSize: 20,
        fontWeight: FontWeight.w700,
      ),
    ),

    // الأزرار الأساسية: حبّة برتقالية بارزة
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(0, 52),
        shape: pill,
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: YallaColors.primary,
        foregroundColor: YallaColors.onPrimary,
        minimumSize: const Size(0, 52),
        elevation: 0,
        shape: pill,
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(0, 48),
        shape: pill,
        side: const BorderSide(color: YallaColors.outline),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: YallaColors.primaryDeep),
    ),

    // الحقول: خلفية بيضاء، حدّ يتحوّل إلى برتقالي عند التركيز
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: YallaColors.card,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: YallaColors.outline),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: YallaColors.outline),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: YallaColors.primary, width: 2),
      ),
      labelStyle: const TextStyle(color: YallaColors.muted),
      prefixIconColor: YallaColors.muted,
    ),

    // الرقائق (Chips) — للعناوين السريعة وحالات الطلب
    chipTheme: ChipThemeData(
      backgroundColor: YallaColors.secondaryContainer,
      side: BorderSide.none,
      labelStyle: const TextStyle(color: YallaColors.secondaryDeep, fontWeight: FontWeight.w600),
      shape: const StadiumBorder(),
    ),

    // زرّ عائم برتقالي (FAB)
    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      backgroundColor: YallaColors.primary,
      foregroundColor: YallaColors.onPrimary,
    ),

    // شريط تنقّل سفلي أبيض مع تحديد برتقالي
    navigationBarTheme: const NavigationBarThemeData(
      backgroundColor: YallaColors.card,
      indicatorColor: YallaColors.primaryContainer,
      elevation: 3,
    ),
    bottomNavigationBarTheme: const BottomNavigationBarThemeData(
      backgroundColor: YallaColors.card,
      selectedItemColor: YallaColors.primary,
      unselectedItemColor: YallaColors.muted,
      type: BottomNavigationBarType.fixed,
      elevation: 3,
    ),

    dividerTheme: const DividerThemeData(color: Color(0xFFF0EEEC), thickness: 1),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: YallaColors.primary),
    snackBarTheme: const SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: Color(0xFF2F3133),
      contentTextStyle: TextStyle(color: Colors.white),
    ),
  );
}
