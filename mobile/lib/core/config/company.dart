// بيانات التواصل الرسمية للشركة (Card 43).
// رقم الواتس اب الرسمي للدعم والتواصل المباشر.
class Company {
  // رقم واتس اب الشركة (بصيغة دوليّة بلا + أو مسافات لرابط wa.me)
  static const String whatsappNumber = '970593456405';

  // رسالة افتتاحية جاهزة عند فتح الواتس اب
  static const String whatsappGreeting = 'مرحبًا، أحتاج مساعدة بخصوص تطبيق يلا';

  // رابط الواتس اب المباشر (wa.me) مع الرسالة الافتتاحية
  static Uri whatsappUri() => Uri.parse(
        'https://wa.me/$whatsappNumber?text=${Uri.encodeComponent(whatsappGreeting)}',
      );
}
