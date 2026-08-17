// شاشة الطلب النشط (تطبيق الكابتن) — موصولة بالخادم الحقيقي.
// تعرض الطلب المُسنَد فعليًا وتتيح: قبول -> استلام -> تسليم (أو رفض قبل الاستلام)،
// بالإضافة إلى مفتاح التوفّر (online/offline) الذي يُعلم الأدمن بحالة الكابتن.

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/network/api_client.dart';
import '../../core/maps/maps_service.dart';
import '../../core/realtime/socket_service.dart';
import '../../core/theme/app_theme.dart';
import '../chat/chat_screen.dart';

class ActiveOrderScreen extends StatefulWidget {
  final ApiClient api;
  final SocketService socket;
  const ActiveOrderScreen({super.key, required this.api, required this.socket});

  @override
  State<ActiveOrderScreen> createState() => _ActiveOrderScreenState();
}

class _ActiveOrderScreenState extends State<ActiveOrderScreen> {
  // الحالات التي تُعتبر "طلبًا نشطًا" (لم يُسلَّم/يُلغَ بعد)
  static const _activeStatuses = ['assigned', 'accepted', 'picked_up'];

  bool _isOnline = false;      // حالة توفّر الكابتن
  bool _busy = false;          // أثناء تنفيذ إجراء (قبول/تسليم/رفض)
  bool _loading = true;        // أثناء الجلب الأولي
  Map<String, dynamic>? _order; // الطلب النشط الحالي (null = لا يوجد)

  @override
  void initState() {
    super.initState();
    _loadStatus();      // نعكس حالة الاتصال الحقيقية (يبقى الكابتن متصلًا بعد إغلاق التطبيق)
    _loadActiveOrder();

    // استقبال طلب جديد مُسنَد لحظيًا (بثّه الخادم عند الإسناد)
    widget.socket.onOrderAssigned((order) {
      if (!mounted) return;
      setState(() => _order = order);
      _snack('وصلك طلب جديد 🛵');
    });

    // تحديثات الحالة (مثل إلغاء الأدمن للطلب) — نزيل الطلب إن انتهى
    widget.socket.onOrderStatusUpdated((order) {
      if (!mounted || _order == null || order['_id'] != _order!['_id']) return;
      final status = order['status'];
      setState(() => _order = _activeStatuses.contains(status) ? order : null);
    });
  }

  // جلب حالة توفّر الكابتن من الخادم لضبط المفتاح عند فتح التطبيق.
  // مهم: الكابتن يظلّ "متصلًا" حتى لو أُغلق التطبيق، فيجب أن يعكس المفتاح ذلك.
  Future<void> _loadStatus() async {
    try {
      final me = await widget.api.get('/auth/me');
      final status = me['captain']?['status'];
      if (mounted && status != null) {
        setState(() => _isOnline = status != 'offline');
      }
    } catch (_) {
      // نتجاهل — يبقى المفتاح على قيمته الافتراضية
    }
  }

  // جلب الطلب النشط الحالي من الخادم (سجلّ الكابتن → أوّل طلب غير منتهٍ)
  Future<void> _loadActiveOrder() async {
    setState(() => _loading = true);
    try {
      final data = await widget.api.get('/captains/me/orders');
      final list = (data as List).cast<Map<String, dynamic>>();
      final active = list.where((o) => _activeStatuses.contains(o['status'])).toList();
      setState(() => _order = active.isNotEmpty ? active.first : null);
    } on ApiException catch (e) {
      _snack(e.message);
    } catch (_) {
      _snack('تعذّر الاتصال بالخادم');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // تبديل التوفّر عبر REST — يُعلم الخادم فيظهر الكابتن للأدمن كـ "متاح"
  Future<void> _toggleOnline(bool value) async {
    setState(() => _isOnline = value);
    try {
      await widget.api.patch('/captains/status', {'status': value ? 'online' : 'offline'});
    } on ApiException catch (e) {
      setState(() => _isOnline = !value); // تراجع عند الفشل
      _snack(e.message);
    } catch (_) {
      setState(() => _isOnline = !value);
      _snack('تعذّر تحديث حالة الاتصال');
    }
  }

  // تقدّم حالة الطلب: accepted -> picked_up -> delivered
  Future<void> _advance(String next) async {
    final id = _order?['_id'];
    if (id == null) return;

    // عند "تم التسليم" (Card 27 + 20): يحدّد الكابتن السعر الحقيقي (≤ التقريبي)
    // ثم يُدخل رمز التسليم من صاحب الطلب لتأكيد الاستلام.
    String? deliveryCode;
    num? finalPrice;
    if (next == 'delivered') {
      final approx = (_order?['price'] as num?) ?? 0;
      finalPrice = await _askFinalPrice(approx);
      if (finalPrice == null) return; // ألغى الكابتن
      deliveryCode = await _askDeliveryCode();
      if (deliveryCode == null) return; // ألغى الكابتن الإدخال
    }

    setState(() => _busy = true);
    try {
      final Map<String, dynamic> body = {'status': next};
      if (deliveryCode != null) body['deliveryCode'] = deliveryCode;
      if (finalPrice != null) body['finalPrice'] = finalPrice;
      final updated = await widget.api.patch('/orders/$id/status', body);
      setState(() => _order = next == 'delivered' ? null : Map<String, dynamic>.from(updated));
      if (next == 'delivered') _snack('تم تسليم الطلب ✓');
    } on ApiException catch (e) {
      _snack(e.message); // يشمل "رمز التسليم غير صحيح"
    } catch (_) {
      _snack('تعذّر تحديث الحالة');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  // نافذة إدخال السعر الحقيقي عند التسليم (Card 27 + 31).
  // Card 31: تبدأ الخانة فارغة ولا نُظهر السعر التقريبي للكابتن، فيُدخل السعر
  // الحقيقي بنفسه. يبقى التحقّق «ألّا يتجاوز التقريبي» قائمًا دون كشف قيمته
  // (والخادم يفرضه أيضًا). نُضيف نسبة الكابتن (٨٠٪) إلى محفظته عند التأكيد.
  Future<num?> _askFinalPrice(num approx) {
    final controller = TextEditingController(); // Card 31: تبدأ فارغة
    String? error;
    return showDialog<num>(
      context: context,
      builder: (_) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: const Text('السعر الحقيقي للتوصيل'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('أدخل السعر الحقيقي للتوصيل الذي تحصّلت عليه من صاحب الطلب.'),
              const SizedBox(height: 12),
              TextField(
                controller: controller,
                keyboardType: const TextInputType.numberWithOptions(decimal: false),
                textAlign: TextAlign.center,
                autofocus: true,
                decoration: InputDecoration(
                  hintText: 'أدخل السعر',
                  suffixText: '₪',
                  errorText: error,
                  border: const OutlineInputBorder(),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('تراجع')),
            FilledButton(
              onPressed: () {
                final v = num.tryParse(controller.text.trim());
                if (v == null || v <= 0) {
                  setLocal(() => error = 'أدخل سعرًا صحيحًا');
                  return;
                }
                // Card 31: نمنع تجاوز التقريبي دون إظهار قيمته للكابتن.
                if (approx > 0 && v > approx) {
                  setLocal(() => error = 'السعر الحقيقي يجب ألّا يتجاوز السعر التقريبي للطلب');
                  return;
                }
                Navigator.pop(context, v);
              },
              child: const Text('متابعة'),
            ),
          ],
        ),
      ),
    );
  }

  // نافذة إدخال رمز التسليم (Card 20)
  Future<String?> _askDeliveryCode() {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('رمز التسليم'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('اطلب من صاحب الطلب رمز التسليم (٤ أرقام) وأدخله لتأكيد التسليم.'),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              keyboardType: TextInputType.number,
              maxLength: 4,
              textAlign: TextAlign.center,
              autofocus: true,
              decoration: const InputDecoration(hintText: '••••', counterText: ''),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('تراجع')),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: const Text('تأكيد التسليم'),
          ),
        ],
      ),
    );
  }

  // رفض الطلب (قبل الاستلام) — يعيده للنظام ليُسنَد لكابتن آخر.
  // Card 24: يكتب الكابتن ملاحظة لسبب الرفض، وبعد الرفض يصبح "غير متصل".
  Future<void> _reject() async {
    final id = _order?['_id'];
    if (id == null) return;
    final reason = await _askRejectReason();
    if (reason == null) return; // تراجع

    setState(() => _busy = true);
    try {
      await widget.api.patch('/orders/$id/reject', {'reason': reason});
      // أصبح الكابتن غير متصل تلقائيًا على الخادم — نعكس ذلك في الواجهة
      setState(() {
        _order = null;
        _isOnline = false;
      });
      _snack('تم رفض الطلب — أصبحت غير متصل');
    } on ApiException catch (e) {
      _snack(e.message);
    } catch (_) {
      _snack('تعذّر رفض الطلب');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  // نافذة كتابة سبب الرفض (Card 24) — مطلوبة قبل تأكيد الرفض
  Future<String?> _askRejectReason() {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('سبب رفض الطلب'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('اكتب سبب الرفض. سيُعاد الطلب للنظام وستصبح غير متصل.'),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              maxLines: 3,
              autofocus: true,
              decoration: const InputDecoration(
                hintText: 'مثال: بعيد عن موقعي / انشغلت بطلب آخر',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('تراجع')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: YallaColors.error),
            onPressed: () {
              final text = controller.text.trim();
              if (text.isEmpty) return; // السبب مطلوب
              Navigator.pop(context, text);
            },
            child: const Text('تأكيد الرفض'),
          ),
        ],
      ),
    );
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  // فتح شاشة الدردشة مع صاحب الطلب (Card 18)
  void _openChat(String orderId) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => ChatScreen(
        orderId: orderId,
        api: widget.api,
        socket: widget.socket,
        myRole: 'captain',
      ),
    ));
  }

  // الاسم الكامل لصاحب الطلب (الاسم الأول + اسم العائلة إن وُجد)
  String _senderName(Map<String, dynamic>? user) {
    if (user == null) return '';
    return [user['name'], user['lastName']].where((p) => p != null && '$p'.trim().isNotEmpty).join(' ');
  }

  // اتصال هاتفي بصاحب الطلب عبر تطبيق الاتصال
  Future<void> _callSender(String phone) async {
    final uri = Uri(scheme: 'tel', path: phone);
    if (!await launchUrl(uri)) _snack('تعذّر بدء الاتصال');
  }

  // فتح خرائط جوجل للملاحة: قبل الاستلام → نقطة الاستلام، بعده → نقطة التسليم (Card 10)
  Future<void> _openNavigation() async {
    final order = _order;
    if (order == null) return;
    final status = order['status'] as String? ?? 'assigned';
    final target = status == 'picked_up' ? order['dropoff'] : order['pickup'];
    final point = MapsService.latLngFrom(target?['location']);
    if (point == null) {
      _snack('لا يوجد موقع صالح لهذه النقطة');
      return;
    }
    final ok = await MapsService.navigateTo(point.lat, point.lng);
    if (!ok) _snack('تعذّر فتح خرائط جوجل');
  }

  // زرّ الإجراء التالي حسب حالة الطلب
  ({String label, String next, IconData icon})? _nextAction(String status) => switch (status) {
        'assigned' => (label: 'قبول الطلب', next: 'accepted', icon: Icons.check_circle),
        'accepted' => (label: 'تم الاستلام', next: 'picked_up', icon: Icons.inventory_2),
        'picked_up' => (label: 'تم التسليم', next: 'delivered', icon: Icons.done_all),
        _ => null,
      };

  String _statusLabel(String status) => switch (status) {
        'assigned' => 'مُسنَد إليك',
        'accepted' => 'مقبول — في الطريق للاستلام',
        'picked_up' => 'تم الاستلام — في الطريق للتسليم',
        _ => status,
      };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('الطلب النشط'),
        actions: [
          // مفتاح التوفّر في شريط التطبيق
          Row(
            children: [
              Text(_isOnline ? 'متصل' : 'غير متصل'),
              Switch(value: _isOnline, onChanged: _busy ? null : _toggleOnline),
            ],
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(onRefresh: _loadActiveOrder, child: _buildBody()),
    );
  }

  Widget _buildBody() {
    final order = _order;

    // لا يوجد طلب نشط حاليًا
    if (order == null) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          const SizedBox(height: 120),
          const Icon(Icons.local_shipping_outlined, size: 64, color: YallaColors.muted),
          const SizedBox(height: 16),
          Center(
            child: Text(
              _isOnline ? 'بانتظار طلب جديد…' : 'فعّل الاتصال لاستقبال الطلبات',
              style: const TextStyle(color: YallaColors.muted, fontSize: 16),
            ),
          ),
        ],
      );
    }

    final status = order['status'] as String? ?? 'assigned';
    final action = _nextAction(status);
    final Map<String, dynamic>? sender =
        order['user'] is Map ? Map<String, dynamic>.from(order['user']) : null;
    final String senderName = _senderName(sender);
    final String senderPhone = (sender?['phone'] ?? '').toString();
    final Map<String, dynamic>? pickupLoc =
        order['pickup'] is Map ? Map<String, dynamic>.from(order['pickup']) : null;
    final Map<String, dynamic>? dropoffLoc =
        order['dropoff'] is Map ? Map<String, dynamic>.from(order['dropoff']) : null;
    final String note = (order['packageNote'] ?? '').toString();
    // Card 30: قيمة التوصيل — الحقيقية بعد التسليم، والتقريبية قبله.
    final num finalPrice = order['finalPrice'] as num? ?? 0;
    final num priceValue =
        (status == 'delivered' && finalPrice > 0) ? finalPrice : (order['price'] as num? ?? 0);
    final String priceLabel = status == 'delivered' ? 'السعر النهائي' : 'قيمة التوصيل';
    final String price = '$priceValue ₪';
    final String distance = '${order['distanceKm'] ?? 0} كم';
    final num etaMin = order['etaMinutes'] as num? ?? 0;

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      children: [
        // شريحة الحالة الحالية
        Card(
          color: Theme.of(context).colorScheme.primaryContainer,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                const Icon(Icons.local_shipping),
                const SizedBox(width: 12),
                Text(_statusLabel(status), style: const TextStyle(fontWeight: FontWeight.bold)),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),

        // بيانات صاحب الطلب: الاسم الكامل + الهاتف مع زرّ اتصال (Card 9)
        if (senderName.isNotEmpty)
          ListTile(
            leading: const Icon(Icons.person),
            title: const Text('صاحب الطلب'),
            subtitle: Text(senderName + (senderPhone.isNotEmpty ? '\n$senderPhone' : '')),
            isThreeLine: senderPhone.isNotEmpty,
            trailing: senderPhone.isNotEmpty
                ? IconButton(
                    icon: const Icon(Icons.call, color: YallaColors.success),
                    tooltip: 'اتصال بصاحب الطلب',
                    onPressed: () => _callSender(senderPhone),
                  )
                : null,
            dense: true,
          ),

        // تفاصيل نقطتَي الاستلام والتسليم مع الحقول المُفصّلة (Card 21 + 25)
        _detailTile(Icons.store, 'الاستلام', _addressDetail(pickupLoc)),
        _detailTile(Icons.flag, 'التسليم', _addressDetail(dropoffLoc)),
        if (note.isNotEmpty) _detailTile(Icons.inventory_2_outlined, 'وصف الشحنة', note),
        // Card 30: قيمة التوصيل والمسافة والزمن التقديري — بطاقات كاملة العرض
        // (بدل صفّ Expanded/ListTile الهشّ) لضمان ظهورها دائمًا في لوحة الكابتن.
        _detailTile(Icons.payments, priceLabel, price),
        _detailTile(Icons.route, 'المسافة', distance),
        if (etaMin > 0) _detailTile(Icons.schedule, 'الزمن التقديري', '${etaMin.round()} دقيقة'),

        const SizedBox(height: 24),

        // زر فتح الملاحة عبر خرائط جوجل (نحو الاستلام قبل الاستلام، والتسليم بعده) — Card 30
        OutlinedButton.icon(
          onPressed: _openNavigation,
          icon: const Icon(Icons.navigation),
          label: Text(status == 'picked_up' ? 'الملاحة إلى التسليم' : 'الملاحة إلى الاستلام'),
        ),
        const SizedBox(height: 12),

        // زر الدردشة مع صاحب الطلب خلال التوصيل (Card 18)
        OutlinedButton.icon(
          onPressed: () => _openChat(order['_id'] as String),
          icon: const Icon(Icons.chat_bubble_outline),
          label: const Text('الدردشة مع صاحب الطلب'),
        ),
        const SizedBox(height: 12),

        // زر تقدّم الحالة (يتغيّر نصّه حسب المرحلة)
        if (action != null)
          FilledButton.icon(
            onPressed: _busy ? null : () => _advance(action.next),
            icon: _busy
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : Icon(action.icon),
            label: Text(action.label),
          ),

        // زر رفض الطلب — متاح قبل الاستلام فقط
        if (status == 'assigned' || status == 'accepted') ...[
          const SizedBox(height: 8),
          TextButton.icon(
            style: TextButton.styleFrom(foregroundColor: YallaColors.error),
            onPressed: _busy ? null : _reject,
            icon: const Icon(Icons.close),
            label: const Text('رفض الطلب'),
          ),
        ],
      ],
    );
  }

  // بناء نصّ العنوان المُفصّل من الحقول: الحي ← الشارع ← التفاصيل ← الملاحظة (Card 21/25).
  // يعود للعنوان الموحّد `address` إن لم تتوفّر الحقول المُفصّلة (توافق مع الطلبات القديمة).
  String _addressDetail(Map<String, dynamic>? loc) {
    if (loc == null) return '—';
    final lines = <String>[];
    void add(String label, dynamic value) {
      final v = (value ?? '').toString().trim();
      if (v.isNotEmpty) lines.add('$label: $v');
    }

    add('الحي', loc['neighborhood']);
    add('الشارع', loc['street']);
    add('التفاصيل', loc['details']);
    add('ملاحظة', loc['note']);

    if (lines.isEmpty) {
      final address = (loc['address'] ?? '—').toString();
      return address.isEmpty ? '—' : address;
    }
    return lines.join('\n');
  }

  // عنصر عرض تفصيلة واحدة
  Widget _detailTile(IconData icon, String label, String value) => ListTile(
        leading: Icon(icon),
        title: Text(label),
        subtitle: Text(value),
        isThreeLine: value.contains('\n'),
        dense: true,
      );
}
