// شاشة أرباح الكابتن وسجلّ توصيلاته.
// تعرض ملخّص الأرباح (إجمالي/اليوم/الأسبوع) وقائمة الطلبات المسلّمة.

import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../../core/realtime/socket_service.dart';

class EarningsScreen extends StatefulWidget {
  final ApiClient api;
  final SocketService socket;
  const EarningsScreen({super.key, required this.api, required this.socket});

  @override
  State<EarningsScreen> createState() => _EarningsScreenState();
}

class _EarningsScreenState extends State<EarningsScreen> {
  Map<String, dynamic>? _earnings;
  Map<String, dynamic>? _wallet;
  List<dynamic> _orders = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();

    // تحديث لحظي: عند تسليم/إلغاء طلب للكابتن تتغيّر الأرباح والسجلّ فأعِد الجلب فورًا
    widget.socket.onOrderStatusUpdated((order) {
      if (!mounted) return;
      final status = order['status'];
      if (status == 'delivered' || status == 'cancelled') _load();
    });
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      // نجلب الأرباح والمحفظة والسجلّ بالتوازي
      final results = await Future.wait([
        widget.api.get('/captains/me/earnings'),
        widget.api.get('/captains/me/orders'),
        widget.api.get('/captains/me/wallet'),
      ]);
      setState(() {
        _earnings = results[0] as Map<String, dynamic>;
        _orders = results[1] as List;
        _wallet = results[2] as Map<String, dynamic>;
      });
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('أرباحي')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // بطاقات ملخّص الأرباح
                  Row(
                    children: [
                      _statCard('اليوم', '${_earnings?['today'] ?? 0} ₪', Colors.green),
                      const SizedBox(width: 12),
                      _statCard('الأسبوع', '${_earnings?['week'] ?? 0} ₪', Colors.blue),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      _statCard('الإجمالي', '${_earnings?['total'] ?? 0} ₪', Colors.deepPurple),
                      const SizedBox(width: 12),
                      _statCard('عدد التوصيلات', '${_earnings?['count'] ?? 0}', Colors.teal),
                    ],
                  ),
                  const SizedBox(height: 12),
                  // Card 4: المبلغ الصافي (بعد خصم عمولة الشركة) مع عمولة محسومة للسياق.
                  Row(
                    children: [
                      _statCard('الصافي', '${_wallet?['net'] ?? 0} ₪', Colors.green.shade700),
                      const SizedBox(width: 12),
                      _statCard('العمولة', '${_wallet?['commission'] ?? 0} ₪', Colors.orange.shade800),
                    ],
                  ),

                  // بطاقة المستحقّ للشركة (COD) — تظهر إن كان هناك مستحقّ
                  if ((_wallet?['owed'] ?? 0) > 0)
                    Card(
                      color: Colors.red.shade50,
                      child: ListTile(
                        leading: const Icon(Icons.account_balance_wallet, color: Colors.red),
                        title: Text('مستحقّ للشركة: ${_wallet?['owed']} ₪'),
                        subtitle: const Text('عمولة محصّلة نقدًا بانتظار التسوية'),
                      ),
                    ),

                  const SizedBox(height: 24),
                  const Text('سجلّ التوصيلات',
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),

                  if (_orders.isEmpty)
                    const Padding(
                      padding: EdgeInsets.all(24),
                      child: Center(child: Text('لا توجد توصيلات بعد')),
                    )
                  else
                    ..._orders.map((o) => _orderTile(o as Map<String, dynamic>)),
                ],
              ),
            ),
    );
  }

  // بطاقة رقم ملخّص
  Widget _statCard(String label, String value, Color color) => Expanded(
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: color)),
                const SizedBox(height: 4),
                Text(label, style: const TextStyle(color: Colors.grey)),
              ],
            ),
          ),
        ),
      );

  // عنصر طلب في السجلّ
  Widget _orderTile(Map<String, dynamic> o) {
    // Card 47: الطلب الذي رفضه الكابتن يظهر كـ"مرفوض" مع زرّ لعرض سبب الرفض.
    final rejectedByMe = o['rejectedByMe'] == true;
    final delivered = o['status'] == 'delivered';
    // Card 28: بعد التسليم نعرض السعر الحقيقي (finalPrice) لا التقريبي (price).
    final num shown = delivered ? _effectivePrice(o) : (o['price'] as num? ?? 0);

    if (rejectedByMe) {
      final reason = (o['rejectReason'] ?? '').toString();
      return Card(
        child: ListTile(
          leading: const Icon(Icons.cancel, color: Colors.red),
          title: Text('${o['dropoff']?['address'] ?? ''}',
              maxLines: 1, overflow: TextOverflow.ellipsis),
          subtitle: const Text('مرفوض', style: TextStyle(color: Colors.red, fontWeight: FontWeight.bold)),
          trailing: TextButton.icon(
            icon: const Icon(Icons.info_outline, size: 18),
            label: const Text('سبب الرفض'),
            onPressed: () => _showRejectReason(reason),
          ),
        ),
      );
    }

    return Card(
      child: ListTile(
        leading: Icon(delivered ? Icons.check_circle : Icons.info,
            color: delivered ? Colors.green : Colors.grey),
        title: Text('${o['dropoff']?['address'] ?? ''}', maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Text(o['status'] ?? ''),
        trailing: Text('$shown ₪', style: const TextStyle(fontWeight: FontWeight.bold)),
      ),
    );
  }

  // Card 47: عرض سبب رفض الطلب في نافذة منبثقة
  void _showRejectReason(String reason) {
    showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('سبب الرفض'),
        content: Text(reason.trim().isEmpty ? 'لم يُذكر سبب' : reason),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('إغلاق')),
        ],
      ),
    );
  }

  // السعر الفعلي للطلب المُسلَّم: الحقيقي إن وُجد، وإلا التقريبي (توافق مع القديم).
  num _effectivePrice(Map<String, dynamic> o) {
    final num finalPrice = o['finalPrice'] as num? ?? 0;
    return finalPrice > 0 ? finalPrice : (o['price'] as num? ?? 0);
  }
}
