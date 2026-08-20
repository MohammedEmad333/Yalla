// شاشة تفاصيل الطلب مع الخطّ الزمني (Timeline).
// تجلب الطلب من /orders/:id وتعرض بياناته وخطوات دورة حياته.

import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../../core/util/names.dart';

class OrderDetailScreen extends StatefulWidget {
  final ApiClient api;
  final String orderId;
  const OrderDetailScreen({super.key, required this.api, required this.orderId});

  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> {
  Map<String, dynamic>? _order;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await widget.api.get('/orders/${widget.orderId}');
      setState(() => _order = data as Map<String, dynamic>);
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // Card 28: السعر المعروض — الحقيقي (finalPrice) بعد التسليم، وإلا التقريبي.
  num _shownPrice() {
    final num finalPrice = _order!['finalPrice'] as num? ?? 0;
    final delivered = _order!['status'] == 'delivered';
    return (delivered && finalPrice > 0) ? finalPrice : (_order!['price'] as num? ?? 0);
  }

  // تسمية حقل السعر: «السعر» تقريبي قبل التسليم، و«السعر النهائي» بعده.
  String _priceLabel() =>
      _order!['status'] == 'delivered' ? 'السعر النهائي' : 'السعر التقريبي';

  // تنسيق مبسّط للتاريخ/الوقت (HH:mm)
  String _fmt(String? iso) {
    if (iso == null) return '';
    final d = DateTime.tryParse(iso)?.toLocal();
    if (d == null) return '';
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(d.hour)}:${two(d.minute)}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('تفاصيل الطلب')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _order == null
              ? const Center(child: Text('تعذّر تحميل الطلب'))
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    // بطاقة معلومات الطلب
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _row('رقم الطلب', '#${(_order!['_id'] as String).substring(_order!['_id'].length - 5)}'),
                            _row('الاستلام', _order!['pickup']?['address'] ?? ''),
                            _row('التسليم', _order!['dropoff']?['address'] ?? ''),
                            // Card 28: بعد التسليم نعرض السعر الحقيقي المدفوع لا التقريبي.
                            _row(_priceLabel(), '${_shownPrice()} ₪'),
                            // Card 48/51: اسم الكابتن (الاسم الأول فقط للعميل)
                            if (_order!['captain'] != null)
                              _row('الكابتن', firstName(_order!['captain']?['name'])),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text('مسار الطلب', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),

                    // الخطّ الزمني (stepper عمودي)
                    ..._buildTimeline(),
                  ],
                ),
    );
  }

  // بناء خطوات الخطّ الزمني من timelineSteps القادمة من الخادم
  List<Widget> _buildTimeline() {
    final steps = (_order!['timelineSteps'] as List?) ?? [];
    return steps.map((raw) {
      final s = raw as Map<String, dynamic>;
      final done = s['done'] == true;
      final cancelled = s['key'] == 'cancelled';
      final color = cancelled ? Colors.red : (done ? Colors.green : Colors.grey);
      return IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // عمود المؤشّر والخطّ
            Column(
              children: [
                Icon(
                  cancelled ? Icons.cancel : (done ? Icons.check_circle : Icons.radio_button_unchecked),
                  color: color, size: 22,
                ),
                Expanded(child: Container(width: 2, color: Colors.grey.shade300)),
              ],
            ),
            const SizedBox(width: 12),
            // النصّ والوقت
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(s['label'] ?? '',
                      style: TextStyle(fontWeight: done ? FontWeight.bold : FontWeight.normal, color: color)),
                  if (s['at'] != null) Text(_fmt(s['at']), style: const TextStyle(color: Colors.grey, fontSize: 12)),
                ],
              ),
            ),
          ],
        ),
      );
    }).toList();
  }

  Widget _row(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          children: [
            SizedBox(width: 90, child: Text(label, style: const TextStyle(color: Colors.grey))),
            Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w500))),
          ],
        ),
      );
}
