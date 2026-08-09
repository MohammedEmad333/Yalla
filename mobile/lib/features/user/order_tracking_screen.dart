// شاشة تتبّع الطلب (تطبيق المستخدم)
// تحمّل الحالة الأولية عبر REST ثم تنضمّ لغرفة الطلب على السوكت لتتلقّى
// موقع الكابتن وتحديثات الحالة لحظيًا، وتحرّك علامة الكابتن على الخريطة.

import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../core/network/api_client.dart';
import '../../core/realtime/socket_service.dart';

class OrderTrackingScreen extends StatefulWidget {
  final String orderId;
  final ApiClient api;
  final SocketService socket;

  const OrderTrackingScreen({
    super.key,
    required this.orderId,
    required this.api,
    required this.socket,
  });

  @override
  State<OrderTrackingScreen> createState() => _OrderTrackingScreenState();
}

class _OrderTrackingScreenState extends State<OrderTrackingScreen> {
  GoogleMapController? _map;

  LatLng? _pickup;
  LatLng? _dropoff;
  LatLng? _captain;        // موقع الكابتن اللحظي
  String _status = 'pending';
  String _captainName = '';

  @override
  void initState() {
    super.initState();
    _loadInitial();     // 1) الحالة الأولية عبر REST
    _subscribeRealtime(); // 2) الاشتراك في التحديثات اللحظية
  }

  // تحميل تفاصيل الطلب لرسم النقاط الثابتة وحالة البداية
  Future<void> _loadInitial() async {
    try {
      final data = await widget.api.get('/orders/${widget.orderId}');
      final pick = data['pickup']['location']['coordinates']; // [lng, lat]
      final drop = data['dropoff']['location']['coordinates'];
      setState(() {
        _pickup = LatLng(pick[1], pick[0]);
        _dropoff = LatLng(drop[1], drop[0]);
        _status = data['status'] ?? 'pending';
        _captainName = data['captain']?['name'] ?? '';
        // موقع الكابتن الابتدائي إن كان متوفّرًا
        final cap = data['captain']?['currentLocation']?['coordinates'];
        if (cap != null) _captain = LatLng(cap[1], cap[0]);
      });
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  // الانضمام لغرفة الطلب والاستماع للأحداث
  void _subscribeRealtime() {
    widget.socket.joinOrder(widget.orderId);

    // كل تحديث لموقع الكابتن يحرّك العلامة ويحرّك الكاميرا
    widget.socket.onCaptainLocation((data) {
      if (data['orderId'] != widget.orderId) return;
      final pos = LatLng((data['lat'] as num).toDouble(), (data['lng'] as num).toDouble());
      setState(() => _captain = pos);
      _map?.animateCamera(CameraUpdate.newLatLng(pos));
    });

    // تحديث حالة الطلب (accepted/picked_up/delivered)
    widget.socket.onOrderStatusUpdated((data) {
      if (data['_id'] != widget.orderId) return;
      setState(() => _status = data['status'] ?? _status);
    });
  }

  // بناء العلامات: استلام (أخضر)، تسليم (أحمر)، كابتن (أزرق)
  Set<Marker> _markers() {
    final m = <Marker>{};
    if (_pickup != null) {
      m.add(Marker(
        markerId: const MarkerId('pickup'),
        position: _pickup!,
        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueGreen),
      ));
    }
    if (_dropoff != null) {
      m.add(Marker(
        markerId: const MarkerId('dropoff'),
        position: _dropoff!,
        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
      ));
    }
    if (_captain != null) {
      m.add(Marker(
        markerId: const MarkerId('captain'),
        position: _captain!,
        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueAzure),
        infoWindow: InfoWindow(title: _captainName.isEmpty ? 'الكابتن' : _captainName),
      ));
    }
    return m;
  }

  // نصّ عربي مبسّط للحالة
  String get _statusText => switch (_status) {
        'pending' => 'بانتظار إسناد كابتن...',
        'assigned' => 'تم تعيين كابتن',
        'accepted' => 'الكابتن في الطريق إليك',
        'picked_up' => 'الطلب في الطريق للتسليم',
        'delivered' => 'تم التسليم ✓',
        'cancelled' => 'تم إلغاء الطلب',
        _ => _status,
      };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('تتبّع الطلب')),
      body: Column(
        children: [
          // شريط الحالة اللحظي
          Container(
            width: double.infinity,
            color: Theme.of(context).colorScheme.primaryContainer,
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                const Icon(Icons.delivery_dining),
                const SizedBox(width: 12),
                Text(_statusText, style: const TextStyle(fontWeight: FontWeight.bold)),
              ],
            ),
          ),
          Expanded(
            child: GoogleMap(
              initialCameraPosition: CameraPosition(
                target: _pickup ?? const LatLng(30.0444, 31.2357),
                zoom: 13,
              ),
              onMapCreated: (c) => _map = c,
              markers: _markers(),
            ),
          ),

          // زر إلغاء الطلب — يظهر قبل الاستلام فقط
          if (_canCancel)
            Padding(
              padding: const EdgeInsets.all(12),
              child: SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
                  onPressed: _cancelOrder,
                  icon: const Icon(Icons.cancel),
                  label: const Text('إلغاء الطلب'),
                ),
              ),
            ),
        ],
      ),
    );
  }

  // يُسمح بالإلغاء قبل الاستلام فقط (يطابق قاعدة الخادم)
  bool get _canCancel => ['pending', 'assigned', 'accepted'].contains(_status);

  // تأكيد ثم إرسال طلب الإلغاء للخادم
  Future<void> _cancelOrder() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('إلغاء الطلب'),
        content: const Text('هل أنت متأكّد من إلغاء هذا الطلب؟'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('تراجع')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('نعم، ألغِ')),
        ],
      ),
    );
    if (confirm != true) return;

    try {
      await widget.api.post('/orders/${widget.orderId}/cancel', {'reason': 'ألغاه المستخدم'});
      setState(() => _status = 'cancelled');
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  @override
  void dispose() {
    _map?.dispose();
    super.dispose();
  }
}
