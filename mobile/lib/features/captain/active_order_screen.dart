// شاشة الطلب النشط (تطبيق الكابتن)
// تعرض تفاصيل الطلب المُسنَد وتتيح تحديث الحالة: قبول -> استلام -> تسليم،
// بالإضافة إلى مفتاح تبديل التوفّر (online/offline).

import 'package:flutter/material.dart';

// نموذج مبسّط للحالات (يطابق ثوابت الـ Backend)
enum OrderStatus { assigned, accepted, pickedUp, delivered }

class ActiveOrderScreen extends StatefulWidget {
  const ActiveOrderScreen({super.key});

  @override
  State<ActiveOrderScreen> createState() => _ActiveOrderScreenState();
}

class _ActiveOrderScreenState extends State<ActiveOrderScreen> {
  bool _isOnline = false;                    // حالة توفّر الكابتن
  OrderStatus _status = OrderStatus.assigned; // حالة الطلب الحالي
  bool _busy = false;

  // بيانات الطلب (تُملأ من حدث order:assigned عبر السوكت)
  final Map<String, String> _order = {
    'pickup': 'شارع التحرير، وسط البلد',
    'dropoff': 'شارع الهرم، الجيزة',
    'note': 'ظرف مستندات',
    'price': '45 ج.م',
  };

  // تبديل التوفّر — يرسل حدث captain:toggle_status عبر السوكت
  Future<void> _toggleOnline(bool value) async {
    setState(() => _isOnline = value);
    // socket.emit('captain:toggle_status', {'status': value ? 'online':'offline'});
  }

  // تحديد الزر التالي بحسب الحالة الحالية
  ({String label, OrderStatus next, IconData icon})? _nextAction() {
    switch (_status) {
      case OrderStatus.assigned:
        return (label: 'قبول الطلب', next: OrderStatus.accepted, icon: Icons.check_circle);
      case OrderStatus.accepted:
        return (label: 'تم الاستلام', next: OrderStatus.pickedUp, icon: Icons.inventory_2);
      case OrderStatus.pickedUp:
        return (label: 'تم التسليم', next: OrderStatus.delivered, icon: Icons.done_all);
      case OrderStatus.delivered:
        return null; // انتهى الطلب
    }
  }

  // إرسال تحديث الحالة للـ Backend عبر السوكت
  Future<void> _advanceStatus(OrderStatus next) async {
    setState(() => _busy = true);
    try {
      // final ack = await socket.emitWithAck('order:update_status',
      //   {'orderId': orderId, 'status': _mapToApi(next)});
      await Future.delayed(const Duration(milliseconds: 600)); // محاكاة
      setState(() => _status = next);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  // رفض الطلب (قبل الاستلام) — يعيده للنظام ليُسنَد لكابتن آخر
  Future<void> _rejectOrder() async {
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
    // الاستدعاء الحقيقي: PATCH /api/orders/:id/reject
    // يعيد الطلب للمجمّع ويُعاد إسناده لأقرب كابتن آخر (باستثناء من رفض).
    // await api.patch('/orders/$orderId/reject', {});
    await Future.delayed(const Duration(milliseconds: 600)); // محاكاة
    if (mounted) {
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم رفض الطلب — بانتظار طلب جديد')),
      );
    }
  }

  // نصّ عربي لكل حالة
  String _statusLabel(OrderStatus s) => switch (s) {
        OrderStatus.assigned => 'مُسنَد إليك',
        OrderStatus.accepted => 'مقبول — في الطريق للاستلام',
        OrderStatus.pickedUp => 'تم الاستلام — في الطريق للتسليم',
        OrderStatus.delivered => 'تم التسليم ✓',
      };

  @override
  Widget build(BuildContext context) {
    final action = _nextAction();

    return Scaffold(
      appBar: AppBar(
        title: const Text('الطلب النشط'),
        actions: [
          // مفتاح التوفّر في شريط التطبيق
          Row(
            children: [
              Text(_isOnline ? 'متصل' : 'غير متصل'),
              Switch(value: _isOnline, onChanged: _toggleOnline),
            ],
          ),
        ],
      ),
      body: !_isOnline
          // إن كان غير متصل نعرض رسالة بدلًا من الطلب
          ? const Center(child: Text('فعّل الاتصال لاستقبال الطلبات'))
          : Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
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
                          Text(_statusLabel(_status),
                              style: const TextStyle(fontWeight: FontWeight.bold)),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // تفاصيل الطلب
                  _detailTile(Icons.store, 'الاستلام', _order['pickup']!),
                  _detailTile(Icons.flag, 'التسليم', _order['dropoff']!),
                  _detailTile(Icons.note, 'ملاحظة', _order['note']!),
                  _detailTile(Icons.payments, 'قيمة التوصيل', _order['price']!),

                  const Spacer(),

                  // زر فتح الملاحة في خرائط جوجل
                  OutlinedButton.icon(
                    onPressed: () {/* launchUrl(google maps directions) */},
                    icon: const Icon(Icons.navigation),
                    label: const Text('بدء الملاحة'),
                  ),
                  const SizedBox(height: 12),

                  // زر تقدّم الحالة (يتغيّر نصّه حسب المرحلة)
                  if (action != null)
                    FilledButton.icon(
                      onPressed: _busy ? null : () => _advanceStatus(action.next),
                      icon: _busy
                          ? const SizedBox(
                              width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                          : Icon(action.icon),
                      label: Text(action.label),
                    )
                  else
                    const Center(child: Text('اكتمل الطلب — بانتظار طلب جديد')),

                  // زر رفض الطلب — متاح قبل الاستلام فقط
                  if (_status == OrderStatus.assigned || _status == OrderStatus.accepted) ...[
                    const SizedBox(height: 8),
                    TextButton.icon(
                      style: TextButton.styleFrom(foregroundColor: Colors.red),
                      onPressed: _busy ? null : _rejectOrder,
                      icon: const Icon(Icons.close),
                      label: const Text('رفض الطلب'),
                    ),
                  ],
                ],
              ),
            ),
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
