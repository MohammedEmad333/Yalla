// اختبارات نظام الألوان والوضع الليلي.
// تتحقّق من أنّ الألوان تتبع سطوع الواجهة، وأنّ بناء الثيمين لا يفسد سطوع الجلسة.
//
// ملاحظة: `google_fonts` يحاول تنزيل الخطّ من الشبكة أثناء الاختبار (غير متاحة)،
// فيُبلّغ عن الخطأ لاحقًا؛ نستنزفه بـ takeException لأنّه لا يخصّ ما نختبره.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yalla/core/theme/app_theme.dart';
import 'package:yalla/core/widgets/ui.dart';

/// يتجاهل أخطاء تحميل الخطوط المتأخّرة داخل بيئة الاختبار.
void _drainFontErrors(WidgetTester tester) {
  while (tester.takeException() != null) {}
}

void main() {
  tearDown(() => YallaColors.brightness = Brightness.light);

  test('الألوان تتبدّل مع سطوع الواجهة', () {
    YallaColors.brightness = Brightness.light;
    final lightSurface = YallaColors.surface;
    final lightText = YallaColors.onSurface;

    YallaColors.brightness = Brightness.dark;
    expect(YallaColors.surface, isNot(lightSurface));
    expect(YallaColors.onSurface, isNot(lightText));

    // الوضع الليلي: سطح داكن ونصّ فاتح — والعكس في الوضع الفاتح
    expect(YallaColors.surface.computeLuminance(), lessThan(0.2));
    expect(YallaColors.onSurface.computeLuminance(), greaterThan(0.7));

    YallaColors.brightness = Brightness.light;
    expect(YallaColors.surface.computeLuminance(), greaterThan(0.8));
    expect(YallaColors.onSurface.computeLuminance(), lessThan(0.1));
  });

  testWidgets('بناء الثيمين لا يترك سطوع اللوحة معدّلًا', (tester) async {
    YallaColors.brightness = Brightness.dark;
    buildYallaTheme(Brightness.light);
    buildYallaTheme(Brightness.dark);
    // التطبيق يبني النسختين في كل إطار — يجب أن يبقى السطوع كما ضبطه الجذر
    expect(YallaColors.brightness, Brightness.dark);
    await tester.pump();
    _drainFontErrors(tester);
  });

  testWidgets('ثيم كل وضع يستخدم أسطحه الصحيحة', (tester) async {
    final light = buildYallaTheme(Brightness.light);
    final dark = buildYallaTheme(Brightness.dark);

    expect(light.brightness, Brightness.light);
    expect(dark.brightness, Brightness.dark);
    expect(light.scaffoldBackgroundColor.computeLuminance(), greaterThan(0.8));
    expect(dark.scaffoldBackgroundColor.computeLuminance(), lessThan(0.2));
    await tester.pump();
    _drainFontErrors(tester);
  });

  testWidgets('الشاشات تُرسَم بألوان الوضع الليلي', (tester) async {
    YallaColors.brightness = Brightness.dark;
    await tester.pumpWidget(
      MaterialApp(
        theme: buildYallaTheme(Brightness.light),
        darkTheme: buildYallaTheme(Brightness.dark),
        themeMode: ThemeMode.dark,
        home: const Scaffold(
          body: EmptyStateView(icon: Icons.receipt_long, title: 'لا توجد طلبات'),
        ),
      ),
    );
    _drainFontErrors(tester);

    final scaffold = tester.widget<Material>(
      find.descendant(of: find.byType(Scaffold), matching: find.byType(Material)).first,
    );
    expect(scaffold.color?.computeLuminance() ?? 1, lessThan(0.2));
    expect(find.text('لا توجد طلبات'), findsOneWidget);
    _drainFontErrors(tester);
  });
}
