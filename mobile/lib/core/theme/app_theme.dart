// نظام تصميم يلا للموبايل (Flutter) — نسخة موحّدة مع لوحة الأدمن الجديدة.
//
// المبادئ: أسطح رماديّة محايدة + بطاقات بيضاء بحدّ رفيع بدل الظلال الثقيلة،
// برتقالي العلامة للفعل الأساسي فقط، حوافّ ناعمة، أهداف لمس ≥ ٤٨ بكسل،
// وخطّ IBM Plex Sans Arabic بأحجام متدرّجة واضحة.
//
// كل الألوان تُقرأ من `YallaColors` — لا لون خامّ داخل الشاشات.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

/// ألوان علامة يلا — مصدر واحد للألوان في التطبيق كلّه.
class YallaColors {
  // الأساسي: برتقالي (الطاقة والسرعة)
  static const primary = Color(0xFFFF6B00);
  static const primaryStrong = Color(0xFFE05C00);
  static const primaryDeep = Color(0xFFA04100);
  static const onPrimary = Color(0xFFFFFFFF);
  static const primaryContainer = Color(0xFFFFF1E6); // خلفيّة فاتحة جدًّا
  static const onPrimaryContainer = Color(0xFF7A3100);

  // الثانوي: أزرق (الثقة والمعلومات)
  static const secondary = Color(0xFF0A84FF);
  static const secondaryDeep = Color(0xFF0060C9);
  static const onSecondary = Color(0xFFFFFFFF);
  static const secondaryContainer = Color(0xFFE7F1FF);
  static const onSecondaryContainer = Color(0xFF003558);

  // الأسطح والنصوص (رمادي محايد — يريح العين ليلًا ونهارًا)
  static const surface = Color(0xFFF4F5F7);          // خلفية الشاشة
  static const surfaceContainer = Color(0xFFECEEF1); // حقول ومناطق غائرة
  static const card = Color(0xFFFFFFFF);             // البطاقات
  static const onSurface = Color(0xFF14161A);        // نصّ أساسي
  static const onSurfaceVariant = Color(0xFF4B5158); // نصّ ثانوي
  static const muted = Color(0xFF767D86);            // تسميات/تلميحات
  static const outline = Color(0xFFE4E7EC);          // حدّ رفيع
  static const outlineStrong = Color(0xFFD3D8DE);

  // الحالات
  static const error = Color(0xFFD92D20);
  static const onError = Color(0xFFFFFFFF);
  static const errorContainer = Color(0xFFFDECEA);
  static const success = Color(0xFF0F9D58);
  static const successContainer = Color(0xFFE6F6ED);
  static const warning = Color(0xFFB46B00);
  static const warningContainer = Color(0xFFFFF3E0);

  // ألوان حالة الطلب
  static const statusPending = muted;
  static const statusAssigned = secondary;
  static const statusInTransit = primary;
  static const statusDelivered = success;
  static const statusCancelled = error;
}

/// قياسات موحّدة (حوافّ ومسافات) — تُستخدم من الشاشات بدل الأرقام السحريّة.
class YallaRadii {
  static const sm = 10.0;
  static const md = 14.0;
  static const lg = 18.0;
  static const xl = 24.0;
}

/// يبني ThemeData الخاصّة بيلا (فاتحة، Material 3).
ThemeData buildYallaTheme() {
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
    outlineVariant: YallaColors.outlineStrong,
    error: YallaColors.error,
    onError: YallaColors.onError,
    errorContainer: YallaColors.errorContainer,
  );

  final base = ThemeData(useMaterial3: true, colorScheme: scheme);
  const pill = StadiumBorder();

  // سلّم طباعة واضح: عناوين ثقيلة، نصّ قراءة مريح، تسميات صغيرة هادئة
  final text = GoogleFonts.ibmPlexSansArabicTextTheme(base.textTheme).copyWith(
    headlineSmall: GoogleFonts.ibmPlexSansArabic(
      fontSize: 24, fontWeight: FontWeight.w700, color: YallaColors.onSurface, height: 1.3),
    titleLarge: GoogleFonts.ibmPlexSansArabic(
      fontSize: 20, fontWeight: FontWeight.w700, color: YallaColors.onSurface),
    titleMedium: GoogleFonts.ibmPlexSansArabic(
      fontSize: 16, fontWeight: FontWeight.w600, color: YallaColors.onSurface),
    bodyLarge: GoogleFonts.ibmPlexSansArabic(fontSize: 15, color: YallaColors.onSurface, height: 1.5),
    bodyMedium: GoogleFonts.ibmPlexSansArabic(fontSize: 14, color: YallaColors.onSurfaceVariant, height: 1.5),
    bodySmall: GoogleFonts.ibmPlexSansArabic(fontSize: 12, color: YallaColors.muted),
    labelLarge: GoogleFonts.ibmPlexSansArabic(fontSize: 15, fontWeight: FontWeight.w700),
  );

  return base.copyWith(
    scaffoldBackgroundColor: YallaColors.surface,
    textTheme: text,
    splashFactory: InkSparkle.splashFactory,

    // شريط علوي مسطّح على لون الخلفية (إحساس نظيف)
    appBarTheme: AppBarTheme(
      backgroundColor: YallaColors.surface,
      surfaceTintColor: Colors.transparent,
      foregroundColor: YallaColors.onSurface,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: true,
      titleTextStyle: text.titleLarge,
      systemOverlayStyle: SystemUiOverlayStyle.dark,
    ),

    // البطاقات: بيضاء بحدّ رفيع وظلّ خفيف جدًّا
    cardTheme: CardThemeData(
      color: YallaColors.card,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(YallaRadii.lg),
        side: const BorderSide(color: YallaColors.outline),
      ),
    ),

    // الأزرار الأساسية: حبّة برتقالية بارزة بارتفاع مريح للّمس
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(0, 52),
        shape: pill,
        backgroundColor: YallaColors.primary,
        foregroundColor: YallaColors.onPrimary,
        textStyle: text.labelLarge,
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: YallaColors.primary,
        foregroundColor: YallaColors.onPrimary,
        minimumSize: const Size(0, 52),
        elevation: 0,
        shape: pill,
        textStyle: text.labelLarge,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(0, 48),
        shape: pill,
        foregroundColor: YallaColors.onSurfaceVariant,
        side: const BorderSide(color: YallaColors.outlineStrong),
        textStyle: text.labelLarge?.copyWith(fontSize: 14),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: YallaColors.primaryDeep,
        minimumSize: const Size(0, 44),
        textStyle: text.labelLarge?.copyWith(fontSize: 14),
      ),
    ),
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(
        foregroundColor: YallaColors.onSurfaceVariant,
        minimumSize: const Size(44, 44),
      ),
    ),

    // الحقول: خلفية بيضاء، حدّ هادئ يتحوّل برتقاليًّا عند التركيز
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: YallaColors.card,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(YallaRadii.md),
        borderSide: const BorderSide(color: YallaColors.outlineStrong),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(YallaRadii.md),
        borderSide: const BorderSide(color: YallaColors.outlineStrong),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(YallaRadii.md),
        borderSide: const BorderSide(color: YallaColors.primary, width: 2),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(YallaRadii.md),
        borderSide: const BorderSide(color: YallaColors.error),
      ),
      labelStyle: const TextStyle(color: YallaColors.muted),
      hintStyle: const TextStyle(color: YallaColors.muted),
      prefixIconColor: YallaColors.muted,
      suffixIconColor: YallaColors.muted,
    ),

    // الرقائق — للفلاتر والحالات
    chipTheme: ChipThemeData(
      backgroundColor: YallaColors.card,
      selectedColor: YallaColors.primary,
      checkmarkColor: YallaColors.onPrimary,
      side: const BorderSide(color: YallaColors.outlineStrong),
      labelStyle: const TextStyle(
        color: YallaColors.onSurfaceVariant, fontWeight: FontWeight.w600, fontSize: 13),
      secondaryLabelStyle: const TextStyle(color: YallaColors.onPrimary, fontWeight: FontWeight.w600),
      shape: const StadiumBorder(),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
    ),

    listTileTheme: const ListTileThemeData(
      iconColor: YallaColors.muted,
      minVerticalPadding: 10,
      titleTextStyle: TextStyle(
        fontSize: 15, fontWeight: FontWeight.w600, color: YallaColors.onSurface),
      subtitleTextStyle: TextStyle(fontSize: 13, color: YallaColors.muted),
    ),

    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      backgroundColor: YallaColors.primary,
      foregroundColor: YallaColors.onPrimary,
    ),

    // شريط تنقّل سفلي أبيض مع تحديد برتقالي فاتح
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: YallaColors.card,
      surfaceTintColor: Colors.transparent,
      indicatorColor: YallaColors.primaryContainer,
      elevation: 0,
      height: 68,
      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => TextStyle(
          fontSize: 11,
          fontWeight: states.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500,
          color: states.contains(WidgetState.selected)
              ? YallaColors.primaryDeep
              : YallaColors.muted,
        ),
      ),
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(
          size: 24,
          color: states.contains(WidgetState.selected) ? YallaColors.primaryDeep : YallaColors.muted,
        ),
      ),
    ),

    dividerTheme: const DividerThemeData(color: YallaColors.outline, thickness: 1, space: 1),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: YallaColors.primary),

    dialogTheme: DialogThemeData(
      backgroundColor: YallaColors.card,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(YallaRadii.xl)),
      titleTextStyle: text.titleMedium,
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: YallaColors.card,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(YallaRadii.xl)),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: const Color(0xFF23262B),
      contentTextStyle: const TextStyle(color: Colors.white, fontSize: 14),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(YallaRadii.md)),
      insetPadding: const EdgeInsets.all(16),
    ),
  );
}
