// شاشة "طلباتي" (تطبيق المستخدم) — سجلّ الطلبات بكل حالاتها.
// تعرض السعر والحالة، وتتيح تقييم الكابتن للطلبات المسلّمة غير المقيّمة.

import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import 'rate_order_dialog.dart';

class MyOrdersScreen extends StatefulWidget {
  final ApiClient api;
  const MyOrdersScreen({super.key, required this.api});

  @override
  State<MyOrdersScreen> createState() => _MyOrdersScreenState();
}

class _MyOrdersScreenState extends State<MyOrdersScreen> {
  List<dynamic> _orders = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await widget.api.get('/orders/mine');
      setState(() => _orders = data as List);
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // فتح نافذة التقييم ثم إعادة التحميل عند النجاح
  Future<void> _rate(Map<String, dynamic> order) async {
    final done = await showDialog<bool>(
      context: context,
      builder: (_) => RateOrderDialog(api: widget.api, orderId: order['_id']),
    );
    if (done == true) _load();
  }

  // نصّ ولون لكل حالة
  (String, Color) _statusMeta(String s) => switch (s) {
        'pending' => ('بانتظار كابتن', YallaColors.statusPending),
        'assigned' => ('تم التعيين', YallaColors.statusAssigned),
        'accepted' => ('في الطريق', YallaColors.statusInTransit),
        'picked_up' => ('جارٍ التوصيل', YallaColors.statusInTransit),
        'delivered' => ('تم التسليم', YallaColors.statusDelivered),
        'cancelled' => ('ملغى', YallaColors.statusCancelled),
        _ => (s, YallaColors.muted),
      };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('طلباتي')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _orders.isEmpty
                ? const Center(child: Text('لا توجد طلبات بعد'))
                : ListView.separated(
                    padding: const EdgeInsets.all(12),
                    itemCount: _orders.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (_, i) {
                      final o = _orders[i] as Map<String, dynamic>;
                      final (label, color) = _statusMeta(o['status'] ?? '');
                      final delivered = o['status'] == 'delivered';
                      final rated = o['rating']?['stars'] != null;

                      return Card(
                        child: ListTile(
                          leading: CircleAvatar(
                            backgroundColor: color.withValues(alpha: 0.15),
                            child: Icon(Icons.receipt_long, color: color),
                          ),
                          title: Text('#${(o['_id'] as String).substring(o['_id'].length - 5)}'
                              ' · ${o['price']} ج.م'),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('${o['pickup']?['address']} ← ${o['dropoff']?['address']}',
                                  maxLines: 1, overflow: TextOverflow.ellipsis),
                              Text(label, style: TextStyle(color: color, fontWeight: FontWeight.bold)),
                            ],
                          ),
                          // زر تقييم للطلبات المسلّمة غير المقيّمة
                          trailing: (delivered && !rated)
                              ? TextButton.icon(
                                  onPressed: () => _rate(o),
                                  icon: const Icon(Icons.star_border),
                                  label: const Text('قيّم'),
                                )
                              : rated
                                  ? Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        const Icon(Icons.star, size: 16, color: Colors.amber),
                                        Text('${o['rating']['stars']}'),
                                      ],
                                    )
                                  : null,
                        ),
                      );
                    },
                  ),
      ),
    );
  }
}
