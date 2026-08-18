// شاشة تتبّع الطلب (تطبيق المستخدم) — نسخة بلا خريطة.
// تحمّل الحالة الأولية عبر REST ثم تنضمّ لغرفة الطلب على السوكت لتتلقّى
// حالة الطلب وموقع الكابتن لحظيًا (يُعرَض كإحداثيات + مؤشّر حيّ).
// (يمكن لاحقًا إضافة خريطة عبر google_maps_flutter + مفتاح Google Maps.)

import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../../core/maps/maps_service.dart';
import '../../core/realtime/socket_service.dart';
import '../../core/theme/app_theme.dart';
import '../chat/chat_screen.dart';

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

  // ساعة موقّت الوصول التقديري (Card 39)
  int _etaMinutes = 0;         // الزمن التقديري للتوصيل (دقائق)
  DateTime? _etaStart;         // لحظة بدء العدّ (قبول الكابتن أو الإسناد أو الإنشاء)
  Timer? _ticker;             // مؤقّت يحدّث العدّ التنازلي كل ثانية

  @override
  void initState() {
    super.initState();
    _loadInitial();
    _subscribeRealtime();
    // تحديث العدّ التنازلي كل ثانية أثناء التوصيل
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && _showEta) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  // الحالات التي يُعرَض فيها الموقّت (الطلب قيد التوصيل)
  bool get _inTransit => ['assigned', 'accepted', 'picked_up'].contains(_status);
  bool get _showEta => _inTransit && _etaMinutes > 0 && _etaStart != null;

  // لحظة الوصول التقديرية
  DateTime? get _etaDeadline =>
      _etaStart == null ? null : _etaStart!.add(Duration(minutes: _etaMinutes));

  // الوقت المتبقّي حتى الوصول التقديري (قد يكون سالبًا إن تأخّر)
  Duration get _remaining =>
      _etaDeadline == null ? Duration.zero : _etaDeadline!.difference(DateTime.now());

  // هل تأخّر الطلب عن وقته التقديري؟ (Card 39: تحذير قد لا يصل في الوقت)
  bool get _isLate => _showEta && _remaining.isNegative;

  // تحديد لحظة بدء العدّ من المخطط الزمني للطلب
  DateTime? _resolveEtaStart(Map<String, dynamic> data) {
    final tl = data['timeline'];
    final candidate = (tl?['acceptedAt'] ?? tl?['assignedAt'] ?? data['createdAt'])?.toString();
    if (candidate == null || candidate.isEmpty) return null;
    return DateTime.tryParse(candidate)?.toLocal();
  }

  Future<void> _loadInitial() async {
    try {
      final data = await widget.api.get('/orders/${widget.orderId}');
      setState(() {
        _pickup = data['pickup']?['address'] ?? '';
        _dropoff = data['dropoff']?['address'] ?? '';
        _status = data['status'] ?? 'pending';
        _captainName = data['captain']?['name'] ?? '';
        _etaMinutes = (data['etaMinutes'] as num?)?.toInt() ?? 0;
        _etaStart = _resolveEtaStart(Map<String, dynamic>.from(data as Map));
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
      setState(() {
        _status = data['status'] ?? _status;
        // عند قبول الكابتن نُثبّت بداية العدّ من لحظة القبول لدقّة أعلى
        final start = _resolveEtaStart(Map<String, dynamic>.from(data as Map));
        if (start != null) _etaStart = start;
        final eta = (data['etaMinutes'] as num?)?.toInt();
        if (eta != null && eta > 0) _etaMinutes = eta;
      });
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

  // فتح شاشة الدردشة مع الكابتن (Card 18)
  void _openChat() {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => ChatScreen(
        orderId: widget.orderId,
        api: widget.api,
        socket: widget.socket,
        myRole: 'user',
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    // الدردشة متاحة خلال فترة التوصيل فقط (بعد إسناد كابتن)
    final canChat = ['assigned', 'accepted', 'picked_up'].contains(_status);
    return Scaffold(
      appBar: AppBar(
        title: const Text('تتبّع الطلب'),
        actions: [
          if (canChat)
            IconButton(
              tooltip: 'الدردشة مع الكابتن',
              icon: const Icon(Icons.chat_bubble_outline),
              onPressed: _openChat,
            ),
        ],
      ),
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

          // ساعة موقّت الوصول التقديري + تحذير التأخّر (Card 39)
          if (_showEta) _etaCard(),

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

  // بطاقة موقّت الوصول التقديري (Card 39): عدّ تنازلي حيّ + تحذير عند التأخّر
  Widget _etaCard() {
    final late = _isLate;
    // عند التأخّر نعرض مقدار التأخّر، وإلّا الوقت المتبقّي
    final d = _remaining.abs();
    final mm = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final ss = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    final hh = d.inHours;
    final clock = hh > 0 ? '$hh:${mm}:$ss' : '$mm:$ss';
    final deadline = _etaDeadline!;
    final arriveAt =
        '${deadline.hour.toString().padLeft(2, '0')}:${deadline.minute.toString().padLeft(2, '0')}';

    return Card(
      color: late ? const Color(0xFFFEF3C7) : Theme.of(context).colorScheme.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: late ? const Color(0xFFF59E0B) : YallaColors.outline),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(late ? Icons.warning_amber : Icons.timer,
                    color: late ? const Color(0xFF92400E) : YallaColors.primary),
                const SizedBox(width: 10),
                Text(
                  late ? 'تأخّر عن الوقت المتوقّع' : 'الوصول المتوقّع خلال',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: late ? const Color(0xFF92400E) : YallaColors.onSurface,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              late ? 'مضى $clock على الوقت المتوقّع' : clock,
              style: TextStyle(
                fontSize: 30,
                fontWeight: FontWeight.w800,
                color: late ? const Color(0xFF92400E) : YallaColors.primary,
              ),
            ),
            const SizedBox(height: 4),
            Text('الوقت التقديري للوصول: $arriveAt',
                style: const TextStyle(color: YallaColors.muted, fontSize: 12)),
            if (late) ...[
              const SizedBox(height: 8),
              const Text(
                'قد لا يصل الطلب في الوقت المتوقّع — يمكنك مراسلة الكابتن للاطمئنان.',
                style: TextStyle(color: Color(0xFF92400E), fontSize: 13),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _tile(IconData icon, String label, String value) =>
      Card(child: ListTile(leading: Icon(icon), title: Text(label), subtitle: Text(value)));
}
