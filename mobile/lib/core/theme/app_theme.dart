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
///
/// كل لون **مُشتَقّ** (getter) يتبع `YallaColors.brightness` الحاليّة، فيتحوّل
/// التطبيق كلّه بين الوضعين الفاتح والليلي دون تعديل أيّ شاشة. تُضبط القيمة
/// مرّة واحدة في جذر التطبيق (main.dart) قبل بناء الشجرة.
class YallaColors {
  /// سطوع الواجهة الحالي — يضبطه جذر التطبيق من وضع العرض المختار.
  static Brightness brightness = Brightness.light;
  static bool get _dark => brightness == Brightness.dark;

  // الأساسي: برتقالي (الطاقة والسرعة) — يُفتَّح قليلًا ليلًا ليبقى مقروءًا
  static Color get primary => _dark ? const Color(0xFFFF8124) : const Color(0xFFFF6B00);
  static Color get primaryStrong => _dark ? const Color(0xFFFF9445) : const Color(0xFFE05C00);
  static Color get primaryDeep => _dark ? const Color(0xFFFFB37A) : const Color(0xFFA04100);
  static Color get onPrimary => _dark ? const Color(0xFF1A0E05) : const Color(0xFFFFFFFF);
  static Color get primaryContainer => _dark ? const Color(0xFF3A2413) : const Color(0xFFFFF1E6);
  static Color get onPrimaryContainer => _dark ? const Color(0xFFFFC9A0) : const Color(0xFF7A3100);

  // الثانوي: أزرق (الثقة والمعلومات)
  static Color get secondary => _dark ? const Color(0xFF4DA3FF) : const Color(0xFF0A84FF);
  static Color get secondaryDeep => _dark ? const Color(0xFF8CC4FF) : const Color(0xFF0060C9);
  static Color get onSecondary => _dark ? const Color(0xFF04182B) : const Color(0xFFFFFFFF);
  static Color get secondaryContainer => _dark ? const Color(0xFF14263A) : const Color(0xFFE7F1FF);
  static Color get onSecondaryContainer => _dark ? const Color(0xFFBBDBFF) : const Color(0xFF003558);

  // الأسطح والنصوص
  static Color get surface => _dark ? const Color(0xFF14161A) : const Color(0xFFF4F5F7);
  static Color get surfaceContainer => _dark ? const Color(0xFF24282E) : const Color(0xFFECEEF1);
  static Color get card => _dark ? const Color(0xFF1C1F24) : const Color(0xFFFFFFFF);
  static Color get onSurface => _dark ? const Color(0xFFEEF0F3) : const Color(0xFF14161A);
  static Color get onSurfaceVariant => _dark ? const Color(0xFFC2C7CE) : const Color(0xFF4B5158);
  static Color get muted => _dark ? const Color(0xFF8C939C) : const Color(0xFF767D86);
  static Color get outline => _dark ? const Color(0xFF2C3138) : const Color(0xFFE4E7EC);
  static Color get outlineStrong => _dark ? const Color(0xFF3A4048) : const Color(0xFFD3D8DE);

  // الحالات
  static Color get error => _dark ? const Color(0xFFFF6B5E) : const Color(0xFFD92D20);
  static Color get onError => _dark ? const Color(0xFF2A0A07) : const Color(0xFFFFFFFF);
  static Color get errorContainer => _dark ? const Color(0xFF3A1A17) : const Color(0xFFFDECEA);
  static Color get success => _dark ? const Color(0xFF43C48A) : const Color(0xFF0F9D58);
  static Color get successContainer => _dark ? const Color(0xFF14301F) : const Color(0xFFE6F6ED);
  static Color get warning => _dark ? const Color(0xFFE5A13A) : const Color(0xFFB46B00);
  static Color get warningContainer => _dark ? const Color(0xFF33260F) : const Color(0xFFFFF3E0);

  // ألوان حالة الطلب
  static Color get statusPending => muted;
  static Color get statusAssigned => secondary;
  static Color get statusInTransit => primary;
  static Color get statusDelivered => success;
  static Color get statusCancelled => error;
}

/// قياسات موحّدة (حوافّ ومسافات) — تُستخدم من الشاشات بدل الأرقام السحريّة.
class YallaRadii {
  static const sm = 10.0;
  static const md = 14.0;
  static const lg = 18.0;
  static const xl = 24.0;
}

/// يبني ThemeData الخاصّة بيلا لسطوع معيّن (فاتح/ليلي) — Material 3.
/// ملاحظة: تُضبط `YallaColors.brightness` أوّلًا حتى تُقرأ الألوان الصحيحة.
ThemeData buildYallaTheme([Brightness brightness = Brightness.light]) {
  // نضبط السطوع مؤقّتًا لقراءة الألوان الصحيحة، ثمّ نُعيده كما كان — فالتطبيق
  // يبني النسختين (فاتحة وداكنة) في كل إطار، ويجب ألّا يفسد ذلك سطوع الجلسة.
  final previousBrightness = YallaColors.brightness;
  YallaColors.brightness = brightness;
  final scheme = ColorScheme.fromSeed(
    seedColor: YallaColors.primary,
    brightness: brightness,
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
  // الألوان تُقرأ أثناء بناء ThemeData أدناه (قِيَم ثابتة داخل الثيم الناتج)

  // سلّم طباعة واضح: عناوين ثقيلة، نصّ قراءة مريح، تسميات صغيرة هادئة.
  // نبنيه أوّلًا بلا خطّ محدّد، ثمّ نُلبسه خطّ IBM Plex Sans Arabic — وإن تعذّر
  // تحميل الخطّ (بلا شبكة أو داخل الاختبارات) يبقى النصّ بخطّ النظام بلا انهيار.
  final plain = base.textTheme.copyWith(
    headlineSmall: TextStyle(
        fontSize: 24, fontWeight: FontWeight.w700, color: YallaColors.onSurface, height: 1.3),
    titleLarge:
        TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: YallaColors.onSurface),
    titleMedium:
        TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: YallaColors.onSurface),
    bodyLarge: TextStyle(fontSize: 15, color: YallaColors.onSurface, height: 1.5),
    bodyMedium: TextStyle(fontSize: 14, color: YallaColors.onSurfaceVariant, height: 1.5),
    bodySmall: TextStyle(fontSize: 12, color: YallaColors.muted),
    labelLarge: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
  );

  TextTheme text;
  try {
    text = GoogleFonts.ibmPlexSansArabicTextTheme(plain);
  } catch (_) {
    text = plain;
  }

  final theme = base.copyWith(
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
      systemOverlayStyle:
          brightness == Brightness.dark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
    ),

    // البطاقات: بيضاء بحدّ رفيع وظلّ خفيف جدًّا
    cardTheme: CardThemeData(
      color: YallaColors.card,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(YallaRadii.lg),
        side: BorderSide(color: YallaColors.outline),
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
        side: BorderSide(color: YallaColors.outlineStrong),
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
        borderSide: BorderSide(color: YallaColors.outlineStrong),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(YallaRadii.md),
        borderSide: BorderSide(color: YallaColors.outlineStrong),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(YallaRadii.md),
        borderSide: BorderSide(color: YallaColors.primary, width: 2),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(YallaRadii.md),
        borderSide: BorderSide(color: YallaColors.error),
      ),
      labelStyle: TextStyle(color: YallaColors.muted),
      hintStyle: TextStyle(color: YallaColors.muted),
      prefixIconColor: YallaColors.muted,
      suffixIconColor: YallaColors.muted,
    ),

    // الرقائق — للفلاتر والحالات
    chipTheme: ChipThemeData(
      backgroundColor: YallaColors.card,
      selectedColor: YallaColors.primary,
      checkmarkColor: YallaColors.onPrimary,
      side: BorderSide(color: YallaColors.outlineStrong),
      labelStyle: TextStyle(
        color: YallaColors.onSurfaceVariant, fontWeight: FontWeight.w600, fontSize: 13),
      secondaryLabelStyle: TextStyle(color: YallaColors.onPrimary, fontWeight: FontWeight.w600),
      shape: const StadiumBorder(),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
    ),

    listTileTheme: ListTileThemeData(
      iconColor: YallaColors.muted,
      minVerticalPadding: 10,
      titleTextStyle: TextStyle(
        fontSize: 15, fontWeight: FontWeight.w600, color: YallaColors.onSurface),
      subtitleTextStyle: TextStyle(fontSize: 13, color: YallaColors.muted),
    ),

    floatingActionButtonTheme: FloatingActionButtonThemeData(
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

    dividerTheme: DividerThemeData(color: YallaColors.outline, thickness: 1, space: 1),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: YallaColors.primary),

    dialogTheme: DialogThemeData(
      backgroundColor: YallaColors.card,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(YallaRadii.xl)),
      titleTextStyle: text.titleMedium,
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: YallaColors.card,
      surfaceTintColor: Colors.transparent,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(YallaRadii.xl)),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: brightness == Brightness.dark
          ? const Color(0xFF33383F)
          : const Color(0xFF23262B),
      contentTextStyle: const TextStyle(color: Colors.white, fontSize: 14),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(YallaRadii.md)),
      insetPadding: const EdgeInsets.all(16),
    ),
  );

  YallaColors.brightness = previousBrightness;
  return theme;
}
