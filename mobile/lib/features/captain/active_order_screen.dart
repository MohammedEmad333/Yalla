// شاشة الطلب النشط (تطبيق الكابتن) — موصولة بالخادم الحقيقي.
// تعرض الطلب المُسنَد فعليًا وتتيح: قبول -> استلام -> تسليم (أو رفض قبل الاستلام)،
// بالإضافة إلى مفتاح التوفّر (online/offline) الذي يُعلم الأدمن بحالة الكابتن.

import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../../core/realtime/socket_service.dart';
import '../../core/theme/app_theme.dart';

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
    setState(() => _busy = true);
    try {
      final updated = await widget.api.patch('/orders/$id/status', {'status': next});
      setState(() => _order = next == 'delivered' ? null : Map<String, dynamic>.from(updated));
      if (next == 'delivered') _snack('تم تسليم الطلب ✓');
    } on ApiException catch (e) {
      _snack(e.message);
    } catch (_) {
      _snack('تعذّر تحديث الحالة');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  // رفض الطلب (قبل الاستلام) — يعيده للنظام ليُسنَد لكابتن آخر
  Future<void> _reject() async {
    final id = _order?['_id'];
    if (id == null) return;
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('رفض الطلب'),
        content: const Text('سيُعاد الطلب للنظام لإسناده لكابتن آخر. متأكّد؟'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('تراجع')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('رفض')),
        ],
      ),
    );
    if (confirm != true) return;

    setState(() => _busy = true);
    try {
      await widget.api.patch('/orders/$id/reject', {});
      setState(() => _order = null);
      _snack('تم رفض الطلب — بانتظار طلب جديد');
    } on ApiException catch (e) {
      _snack(e.message);
    } catch (_) {
      _snack('تعذّر رفض الطلب');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
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
    final String pickup = (order['pickup']?['address'] ?? '—').toString();
    final String dropoff = (order['dropoff']?['address'] ?? '—').toString();
    final String note = (order['packageNote'] ?? '').toString();
    final String price = '${order['price'] ?? 0} ₪';

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

        // تفاصيل الطلب الحقيقية
        _detailTile(Icons.store, 'الاستلام', pickup),
        _detailTile(Icons.flag, 'التسليم', dropoff),
        if (note.isNotEmpty) _detailTile(Icons.note, 'ملاحظة', note),
        _detailTile(Icons.payments, 'قيمة التوصيل', price),

        const SizedBox(height: 24),

        // زر فتح الملاحة (يُوصَل بخرائط جوجل لاحقًا)
        OutlinedButton.icon(
          onPressed: () {/* TODO: launch maps navigation */},
          icon: const Icon(Icons.navigation),
          label: const Text('بدء الملاحة'),
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

  // عنصر عرض تفصيلة واحدة
  Widget _detailTile(IconData icon, String label, String value) => ListTile(
        leading: Icon(icon),
        title: Text(label),
        subtitle: Text(value),
        dense: true,
      );
}
