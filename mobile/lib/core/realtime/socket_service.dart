// خدمة Socket.io موحّدة للموبايل — تتولّى الاتصال بالتوكن، الانضمام للغرف،
// والاستماع/الإرسال للأحداث. تُستخدم من شاشات التتبّع وبثّ الموقع.
// (تعتمد حزمة socket_io_client)

import 'package:socket_io_client/socket_io_client.dart' as io;

import '../config/app_config.dart';
import '../storage/token_storage.dart';

class SocketService {
  // نفس عنوان الـ Backend (بدون /api لأن السوكت على الجذر) — يُضبط عبر --dart-define
  static const String _url = AppConfig.origin;

  final TokenStorage _tokenStorage;
  io.Socket? _socket;

  // مستمعو الأحداث المُسجّلون من الشاشات. نحتفظ بهم في خريطة (حدث -> قائمة دوال)
  // حتى نُعيد ربطهم بالسوكت فور اكتمال الاتصال (connect غير متزامن) وعند إعادة
  // الاتصال. هذا يُصلح مشكلة "لا يظهر إلا بعد تحديث الصفحة": كانت الشاشات تُسجّل
  // مستمعيها قبل جاهزية _socket فتُهمَل بصمت.
  final Map<String, List<void Function(Map<String, dynamic>)>> _listeners = {};

  SocketService(this._tokenStorage);

  bool get isConnected => _socket?.connected ?? false;

  // فتح الاتصال مع تمرير التوكن في المصادقة (يطابق socketAuth بالخادم)
  Future<void> connect() async {
    // متصل بالفعل — لا نُكرّر
    if (_socket != null && _socket!.connected) return;

    final token = await _tokenStorage.read();
    _socket = io.io(
      _url,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .setAuth({'token': token})
          .build(),
    );

    // نربط مُوزّعًا واحدًا لكل حدث مسجّل على مثيل السوكت. socket.io يحتفظ
    // بالمستمعين عبر إعادة الاتصال، فيكفي ربطها مرّة عند إنشاء السوكت.
    _bindRegisteredListeners();
    _socket!.connect();
  }

  // ربط كل الأحداث المسجّلة حاليًا بمثيل السوكت (مُوزّع واحد لكل حدث يُنادي كل المستمعين)
  void _bindRegisteredListeners() {
    if (_socket == null) return;
    for (final event in _listeners.keys) {
      _socket!.on(event, (data) => _dispatch(event, data));
    }
  }

  // استدعاء كل مستمعي حدث معيّن بأمان (نُحوّل الحمولة إلى Map)
  void _dispatch(String event, dynamic data) {
    final cbs = _listeners[event];
    if (cbs == null || data == null) return;
    final map = Map<String, dynamic>.from(data as Map);
    for (final cb in List.of(cbs)) {
      cb(map);
    }
  }

  // تسجيل مستمع لحدث. يدعم عدّة مستمعين للحدث نفسه (مثل شاشتَي الطلب والأرباح).
  void _addListener(String event, void Function(Map<String, dynamic>) cb) {
    final list = _listeners.putIfAbsent(event, () => []);
    list.add(cb);
    // إن كان السوكت موجودًا بالفعل ولم يُربط هذا الحدث بعد، اربطه الآن
    if (_socket != null && list.length == 1) {
      _socket!.on(event, (data) => _dispatch(event, data));
    }
  }

  // الانضمام لغرفة طلب معيّن لاستقبال تحديثاته وموقع الكابتن
  void joinOrder(String orderId) => _socket?.emit('order:join', {'orderId': orderId});

  // الاستماع لموقع الكابتن اللحظي
  void onCaptainLocation(void Function(Map<String, dynamic>) cb) =>
      _addListener('captain:location', cb);

  // الاستماع لتحديثات حالة الطلب
  void onOrderStatusUpdated(void Function(Map<String, dynamic>) cb) =>
      _addListener('order:status_updated', cb);

  // (للكابتن) الاستماع لطلب جديد مُسنَد لحظيًا
  void onOrderAssigned(void Function(Map<String, dynamic>) cb) =>
      _addListener('order:assigned', cb);

  // الاستماع لإشعار داخلي جديد يُبثّ لحظيًا للمستلِم
  void onNotificationNew(void Function(Map<String, dynamic>) cb) =>
      _addListener('notification:new', cb);

  // (للمستخدم) الاستماع لتحديث رصيد المحفظة لحظيًا (بعد موافقة الأدمن على الشحن)
  void onWalletUpdated(void Function(Map<String, dynamic>) cb) =>
      _addListener('wallet:updated', cb);

  // (للكابتن) بثّ الموقع الحالي أثناء التوصيل
  void sendLocation({required String orderId, required double lng, required double lat}) {
    _socket?.emit('captain:update_location', {'orderId': orderId, 'lng': lng, 'lat': lat});
  }

  // (للكابتن) تبديل التوفّر عبر السوكت
  void toggleStatus(String status) => _socket?.emit('captain:toggle_status', {'status': status});

  void dispose() {
    _socket?.dispose();
    _socket = null;
    _listeners.clear();
  }
}
