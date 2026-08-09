// خدمة Socket.io موحّدة للموبايل — تتولّى الاتصال بالتوكن، الانضمام للغرف،
// والاستماع/الإرسال للأحداث. تُستخدم من شاشات التتبّع وبثّ الموقع.
// (تعتمد حزمة socket_io_client)

import 'package:socket_io_client/socket_io_client.dart' as io;

import '../storage/token_storage.dart';

class SocketService {
  // نفس عنوان الـ Backend (بدون /api لأن السوكت على الجذر)
  static const String _url = 'http://10.0.2.2:4000';

  final TokenStorage _tokenStorage;
  io.Socket? _socket;

  SocketService(this._tokenStorage);

  bool get isConnected => _socket?.connected ?? false;

  // فتح الاتصال مع تمرير التوكن في المصادقة (يطابق socketAuth بالخادم)
  Future<void> connect() async {
    final token = await _tokenStorage.read();
    _socket = io.io(
      _url,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .setAuth({'token': token})
          .build(),
    );
    _socket!.connect();
  }

  // الانضمام لغرفة طلب معيّن لاستقبال تحديثاته وموقع الكابتن
  void joinOrder(String orderId) => _socket?.emit('order:join', {'orderId': orderId});

  // الاستماع لموقع الكابتن اللحظي
  void onCaptainLocation(void Function(Map<String, dynamic>) cb) {
    _socket?.on('captain:location', (data) => cb(Map<String, dynamic>.from(data)));
  }

  // الاستماع لتحديثات حالة الطلب
  void onOrderStatusUpdated(void Function(Map<String, dynamic>) cb) {
    _socket?.on('order:status_updated', (data) => cb(Map<String, dynamic>.from(data)));
  }

  // (للكابتن) بثّ الموقع الحالي أثناء التوصيل
  void sendLocation({required String orderId, required double lng, required double lat}) {
    _socket?.emit('captain:update_location', {'orderId': orderId, 'lng': lng, 'lat': lat});
  }

  // (للكابتن) تبديل التوفّر عبر السوكت
  void toggleStatus(String status) => _socket?.emit('captain:toggle_status', {'status': status});

  void dispose() {
    _socket?.dispose();
    _socket = null;
  }
}
