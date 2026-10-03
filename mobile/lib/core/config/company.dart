// بيانات التواصل الرسمية للشركة (Card 43).
// رقم الهاتف وواتساب الرسميان للدعم والطلبات المباشرة.
class Company {
  // رقم الهاتف المحلي الظاهر للمستخدم وللاتصال المباشر.
  static const String phoneNumber = '0593456405';

  // رقم واتس اب الشركة (بصيغة دوليّة بلا + أو مسافات لرابط wa.me)
  static const String whatsappNumber = '970593456405';

  // رسالة افتتاحية جاهزة للدعم.
  static const String whatsappGreeting = 'مرحبًا، أحتاج مساعدة بخصوص تطبيق يلا';

  // رسالة الطلب المباشر أثناء الصيانة.
  static const String directOrderGreeting =
      'مرحبًا، أريد تقديم طلب توصيل مباشرة بسبب الصيانة المؤقتة في التطبيق.';

  // رابط الاتصال المباشر.
  static Uri phoneUri() => Uri.parse('tel:$phoneNumber');

  // رابط الواتس اب المباشر (wa.me) مع رسالة الدعم.
  static Uri whatsappUri() => Uri.parse(
        'https://wa.me/$whatsappNumber?text=${Uri.encodeComponent(whatsappGreeting)}',
      );

  // رابط واتساب مخصص للطلب المباشر أثناء الصيانة.
  static Uri directOrderWhatsappUri() => Uri.parse(
        'https://wa.me/$whatsappNumber?text=${Uri.encodeComponent(directOrderGreeting)}',
      );
}
