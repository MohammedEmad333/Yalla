// خدمة خرائط جوجل (Card 10) — تفتح تطبيق/موقع خرائط جوجل عبر روابط عميقة.
//
// لا تحتاج مفتاح Google Maps ولا حزمة أصلية (google_maps_flutter)، لذا تعمل على
// الأجهزة الحقيقية فورًا. تُستخدم من شاشة الكابتن (بدء الملاحة) ومن شاشة تتبّع
// المستخدم (عرض موقع الكابتن/الوجهة على الخريطة).
//
// ملاحظة: إحداثيات النظام مخزّنة بصيغة GeoJSON [lng, lat]، بينما تتوقّع روابط
// خرائط جوجل الترتيب lat,lng — لذا نمرّر lat و lng صراحةً في كل دالة.

import 'package:url_launcher/url_launcher.dart';

class MapsService {
  /// فتح ملاحة خرائط جوجل نحو نقطة (خطّ سير القيادة إلى الوجهة).
  static Future<bool> navigateTo(double lat, double lng) {
    // رابط عام يعمل على أندرويد و iOS والويب: يبدأ الملاحة إلى الوجهة.
    final uri = Uri.parse(
      'https://www.google.com/maps/dir/?api=1&destination=$lat,$lng&travelmode=driving',
    );
    return _launch(uri);
  }

  /// فتح ملاحة من نقطة الاستلام إلى نقطة التسليم (مسار كامل).
  static Future<bool> directions({
    required double fromLat,
    required double fromLng,
    required double toLat,
    required double toLng,
  }) {
    final uri = Uri.parse(
      'https://www.google.com/maps/dir/?api=1'
      '&origin=$fromLat,$fromLng&destination=$toLat,$toLng&travelmode=driving',
    );
    return _launch(uri);
  }

  /// عرض موقع (دبّوس) على خرائط جوجل — للاطّلاع دون ملاحة.
  static Future<bool> showLocation(double lat, double lng, {String? label}) {
    final query = label != null && label.isNotEmpty ? '$lat,$lng ($label)' : '$lat,$lng';
    final uri = Uri.parse(
      'https://www.google.com/maps/search/?api=1&query=${Uri.encodeComponent(query)}',
    );
    return _launch(uri);
  }

  /// قراءة إحداثيات [lng, lat] من كائن نقطة (pickup/dropoff/currentLocation)
  /// وإرجاع (lat, lng) — أو null إن كانت غير صالحة/صفرية.
  static ({double lat, double lng})? latLngFrom(dynamic geoPoint) {
    final coords = geoPoint is Map ? geoPoint['coordinates'] : geoPoint;
    if (coords is! List || coords.length < 2) return null;
    final lng = (coords[0] as num?)?.toDouble();
    final lat = (coords[1] as num?)?.toDouble();
    if (lat == null || lng == null) return null;
    // نتجاهل [0,0] (قيمة افتراضية = لا موقع فعلي)
    if (lat == 0 && lng == 0) return null;
    return (lat: lat, lng: lng);
  }

  static Future<bool> _launch(Uri uri) =>
      launchUrl(uri, mode: LaunchMode.externalApplication);
}
