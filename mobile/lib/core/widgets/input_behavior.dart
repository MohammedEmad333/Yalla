import 'package:flutter/material.dart';

/// سلوك موحّد لحقول الإدخال في واجهات Yalla العربية.
///
/// النصوص البشرية (أسماء/عناوين/ملاحظات) تبقى RTL طبيعيًا.
/// القيم التي تُقرأ من اليسار إلى اليمين (أرقام، هواتف، بريد، أكواد،
/// حسابات، لوحات وكلمات مرور) تستخدم LTR مع محاذاة لليمين حتى يبقى
/// موضعها بصريًا متناسقًا مع الواجهة العربية ويعمل المؤشر بشكل طبيعي.
abstract final class YallaInputBehavior {
  static const TextDirection machineDirection = TextDirection.ltr;
  static const TextAlign machineAlign = TextAlign.right;

  static const TextDirection naturalDirection = TextDirection.rtl;
  static const TextAlign naturalAlign = TextAlign.start;
}
