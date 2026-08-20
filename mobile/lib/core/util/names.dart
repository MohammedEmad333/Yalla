// أدوات مساعدة لعرض الأسماء.
// Card 51: في الدردشة (وفي قوائم الطلبات) نعرض الاسم الأول فقط دون اسم العائلة،
// حفاظًا على الخصوصية بين العميل والكابتن.

/// يُرجع الاسم الأول فقط من نصّ الاسم (أوّل كلمة قبل أوّل مسافة).
/// أمثلة: "محمد عماد" → "محمد"، "  أحمد " → "أحمد"، null → "".
String firstName(String? full) {
  if (full == null) return '';
  final trimmed = full.trim();
  if (trimmed.isEmpty) return '';
  return trimmed.split(RegExp(r'\s+')).first;
}
