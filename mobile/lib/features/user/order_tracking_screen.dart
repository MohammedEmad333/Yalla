// شاشة تتبّع الطلب (تطبيق المستخدم) — نسخة بلا خريطة.
// تحمّل الحالة الأولية عبر REST ثم تنضمّ لغرفة الطلب على السوكت لتتلقّى
// حالة الطلب وموقع الكابتن لحظيًا (يُعرَض كإحداثيات + مؤشّر حيّ).
// (يمكن لاحقًا إضافة خريطة عبر google_maps_flutter + مفتاح Google Maps.)

import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../../core/maps/maps_service.dart';
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
  String _pickup = '';
  String _dropoff = '';
  double? _captainLat;
  double? _captainLng;
  DateTime? _lastUpdate;
  String _status = 'pending';
  String _captainName = '';

  @override
  void initState() {
    super.initState();
    _loadInitial();
    _subscribeRealtime();
  }

  Future<void> _loadInitial() async {
    try {
      final data = await widget.api.get('/orders/${widget.orderId}');
      setState(() {
        _pickup = data['pickup']?['address'] ?? '';
        _dropoff = data['dropoff']?['address'] ?? '';
        _status = data['status'] ?? 'pending';
        _captainName = data['captain']?['name'] ?? '';
        final cap = data['captain']?['currentLocation']?['coordinates'];
        if (cap != null) {
          _captainLng = (cap[0] as num).toDouble();
          _captainLat = (cap[1] as num).toDouble();
        }
      });
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  void _subscribeRealtime() {
    widget.socket.joinOrder(widget.orderId);

    // موقع الكابتن اللحظي
    widget.socket.onCaptainLocation((data) {
      if (data['orderId'] != widget.orderId) return;
      setState(() {
        _captainLat = (data['lat'] as num).toDouble();
        _captainLng = (data['lng'] as num).toDouble();
        _lastUpdate = DateTime.now();
      });
    });

    // تحديث حالة الطلب
    widget.socket.onOrderStatusUpdated((data) {
      if (data['_id'] != widget.orderId) return;
      setState(() => _status = data['status'] ?? _status);
    });
  }

  String get _statusText => switch (_status) {
        'pending' => 'بانتظار إسناد كابتن...',
        'assigned' => 'تم تعيين كابتن',
        'accepted' => 'الكابتن في الطريق إليك',
        'picked_up' => 'الطلب في الطريق للتسليم',
        'delivered' => 'تم التسليم ✓',
        'cancelled' => 'تم إلغاء الطلب',
        _ => _status,
      };

  bool get _canCancel => ['pending', 'assigned', 'accepted'].contains(_status);

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
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('تتبّع الطلب')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // شريط الحالة اللحظي
          Card(
            color: Theme.of(context).colorScheme.primaryContainer,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  const Icon(Icons.delivery_dining),
                  const SizedBox(width: 12),
                  Expanded(child: Text(_statusText, style: const TextStyle(fontWeight: FontWeight.bold))),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),

          _tile(Icons.store, 'الاستلام', _pickup),
          _tile(Icons.flag, 'التسليم', _dropoff),
          if (_captainName.isNotEmpty) _tile(Icons.person, 'الكابتن', _captainName),

          // موقع الكابتن اللحظي (كإحداثيات + مؤشّر تحديث حيّ) + فتحه على خرائط جوجل
          if (_captainLat != null)
            Card(
              child: ListTile(
                leading: const Icon(Icons.my_location, color: Colors.blue),
                title: Text('موقع الكابتن: ${_captainLat!.toStringAsFixed(4)}, ${_captainLng!.toStringAsFixed(4)}'),
                subtitle: Text(_lastUpdate != null
                    ? 'آخر تحديث: ${_lastUpdate!.hour.toString().padLeft(2, '0')}:${_lastUpdate!.minute.toString().padLeft(2, '0')}'
                    : 'آخر موقع معروف'),
                trailing: IconButton(
                  icon: const Icon(Icons.map, color: Colors.blue),
                  tooltip: 'عرض على خرائط جوجل',
                  onPressed: () => MapsService.showLocation(
                    _captainLat!,
                    _captainLng!,
                    label: _captainName.isNotEmpty ? 'الكابتن $_captainName' : 'الكابتن',
                  ),
                ),
              ),
            ),

          const SizedBox(height: 16),
          if (_canCancel)
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
                onPressed: _cancelOrder,
                icon: const Icon(Icons.cancel),
                label: const Text('إلغاء الطلب'),
              ),
            ),
        ],
      ),
    );
  }

  Widget _tile(IconData icon, String label, String value) =>
      Card(child: ListTile(leading: Icon(icon), title: Text(label), subtitle: Text(value)));
}
