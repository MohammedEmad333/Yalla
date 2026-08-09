// باثّ موقع الكابتن — يقرأ GPS دوريًا ويرسله عبر السوكت أثناء الطلب النشط.
// نستخدم throttle (كل ~4 ثوانٍ + فلتر مسافة) لتقليل الحِمل على الشبكة والبطارية.
// (يعتمد حزمة geolocator)

import 'dart:async';
import 'package:geolocator/geolocator.dart';

import '../../core/realtime/socket_service.dart';

class LocationBroadcaster {
  final SocketService socket;
  StreamSubscription<Position>? _sub;

  LocationBroadcaster(this.socket);

  // بدء البثّ لطلب معيّن
  Future<void> start(String orderId) async {
    // التأكّد من صلاحية الوصول للموقع
    final permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      final req = await Geolocator.requestPermission();
      if (req == LocationPermission.denied || req == LocationPermission.deniedForever) return;
    }

    // إعدادات الدقّة والفلترة: نرسل فقط عند التحرّك 20م على الأقل
    const settings = LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 20);

    _sub = Geolocator.getPositionStream(locationSettings: settings).listen((pos) {
      // بثّ الموقع للخادم الذي يوزّعه على غرفة الطلب (المستخدم + الأدمن)
      socket.sendLocation(orderId: orderId, lng: pos.longitude, lat: pos.latitude);
    });
  }

  // إيقاف البثّ عند التسليم أو الخروج
  Future<void> stop() async {
    await _sub?.cancel();
    _sub = null;
  }
}
