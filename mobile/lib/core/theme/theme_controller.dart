// وضع العرض (فاتح/ليلي/حسب النظام) — يُحفظ على الجهاز فيبقى بعد إغلاق التطبيق.
//
// نستخدم نفس مخزن flutter_secure_storage المستعمل للتوكن (لا تبعيّة جديدة).
// القيمة تُقرأ عند الإقلاع قبل بناء الواجهة، وأيّ تغيير يُعيد بناء التطبيق كلّه
// عبر ValueNotifier فتتبدّل كل الألوان (YallaColors) تلقائيًّا.

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class ThemeController {
  static const _key = 'yalla_theme_mode';

  static const _aOptions = AndroidOptions(encryptedSharedPreferences: true);
  static const _iOptions = IOSOptions(accessibility: KeychainAccessibility.first_unlock);
  final _storage = const FlutterSecureStorage(aOptions: _aOptions, iOptions: _iOptions);

  /// الوضع الحالي — يستمع له جذر التطبيق فيُعيد البناء عند التبديل.
  final ValueNotifier<ThemeMode> mode = ValueNotifier(ThemeMode.system);

  /// قراءة الوضع المحفوظ عند الإقلاع (آمنة: تتجاهل أي خطأ في المخزن).
  Future<void> restore() async {
    try {
      final saved = await _storage.read(key: _key);
      mode.value = _parse(saved);
    } catch (_) {
      mode.value = ThemeMode.system;
    }
  }

  /// تغيير الوضع وحفظه.
  Future<void> set(ThemeMode value) async {
    mode.value = value;
    try {
      await _storage.write(key: _key, value: value.name);
    } catch (_) {
      // فشل الحفظ لا يمنع تطبيق الوضع في الجلسة الحاليّة
    }
  }

  static ThemeMode _parse(String? v) => switch (v) {
        'light' => ThemeMode.light,
        'dark' => ThemeMode.dark,
        _ => ThemeMode.system,
      };
}

/// تسمية عربية لكل وضع (تُستخدم في شاشة الحساب).
String themeModeLabel(ThemeMode m) => switch (m) {
      ThemeMode.light => 'فاتح',
      ThemeMode.dark => 'ليلي',
      ThemeMode.system => 'حسب النظام',
    };

/// أيقونة كل وضع.
IconData themeModeIcon(ThemeMode m) => switch (m) {
      ThemeMode.light => Icons.light_mode_outlined,
      ThemeMode.dark => Icons.dark_mode_outlined,
      ThemeMode.system => Icons.brightness_auto_outlined,
    };
