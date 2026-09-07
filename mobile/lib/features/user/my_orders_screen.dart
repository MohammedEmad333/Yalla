// شاشة "طلباتي" (تطبيق المستخدم) — سجلّ الطلبات بكل حالاتها.
// تعرض السعر والحالة، وتتيح تقييم الكابتن للطلبات المسلّمة غير المقيّمة،
// وزرّ دردشة مع الكابتن للطلب الجاري توصيله (Card 26).

import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../../core/realtime/socket_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/ui.dart';
import '../../core/util/names.dart';
import '../chat/chat_screen.dart';
import 'order_detail_screen.dart';
import 'rate_order_dialog.dart';

class MyOrdersScreen extends StatefulWidget {
  final ApiClient api;
  final SocketService socket;
  const MyOrdersScreen({super.key, required this.api, required this.socket});

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

  // Card 2: فتح تفاصيل الطلب عند الضغط عليه (المكان، اسم الكابتن، رمز التسليم، الحالة).
  // نعيد التحميل بعد العودة لعكس أي تغيّر في الحالة.
  Future<void> _openDetail(Map<String, dynamic> o) async {
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => OrderDetailScreen(api: widget.api, orderId: o['_id'] as String),
    ));
    if (mounted) _load();
  }

  // فتح شاشة الدردشة مع الكابتن للطلب الجاري توصيله (Card 26)
  // Card 51: نمرّر اسم الكابتن (يُعرض الاسم الأول فقط) ورقمه للاتصال المباشر.
  void _openChat(Map<String, dynamic> o) {
    final captain = o['captain'] as Map<String, dynamic>?;
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => ChatScreen(
        orderId: o['_id'] as String,
        api: widget.api,
        socket: widget.socket,
        myRole: 'user',
        peerName: captain?['name'] as String?,
        peerPhone: captain?['phone'] as String?,
        peerRole: 'captain',
        peerAvatarUrl: captain?['avatarUrl'] as String?, // Card 100
      ),
    ));
  }

  // Card 28: السعر المعروض — الحقيقي (finalPrice) بعد التسليم، وإلا التقريبي.
  num _shownPrice(Map<String, dynamic> o) {
    final num finalPrice = o['finalPrice'] as num? ?? 0;
    return (o['status'] == 'delivered' && finalPrice > 0)
        ? finalPrice
        : (o['price'] as num? ?? 0);
  }

  // هل الطلب في مرحلة توصيل نشطة (يوجد كابتن ويمكن الدردشة معه)؟
  bool _canChat(Map<String, dynamic> o) =>
      const ['assigned', 'accepted', 'picked_up'].contains(o['status']) &&
      o['captain'] != null;

  // نصّ ولون ونغمة شارة لكل حالة
  (String, Color, PillTone) _statusMeta(String s) => switch (s) {
        'pending' => ('بانتظار كابتن', YallaColors.statusPending, PillTone.neutral),
        'assigned' => ('تم التعيين', YallaColors.statusAssigned, PillTone.info),
        'accepted' => ('في الطريق', YallaColors.statusInTransit, PillTone.brand),
        'picked_up' => ('جارٍ التوصيل', YallaColors.statusInTransit, PillTone.brand),
        'delivered' => ('تم التسليم', YallaColors.statusDelivered, PillTone.success),
        'cancelled' => ('ملغى', YallaColors.statusCancelled, PillTone.danger),
        _ => (s, YallaColors.muted, PillTone.neutral),
      };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('طلباتي')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const LoadingView()
            : _orders.isEmpty
                ? const EmptyStateView(
                    icon: Icons.receipt_long_outlined,
                    title: 'لا توجد طلبات بعد',
                    message: 'أنشئ طلب توصيل أو اطلب من أحد المطاعم لتظهر طلباتك هنا.',
                  )
                : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                    itemCount: _orders.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (_, i) {
                      final o = _orders[i] as Map<String, dynamic>;
                      final (label, color, tone) = _statusMeta(o['status'] ?? '');
                      final delivered = o['status'] == 'delivered';
                      final rated = o['rating']?['stars'] != null;
                      final id = o['_id'] as String;
                      final isStore = o['store']?['restaurant'] != null;

                      return YallaCard(
                        // Card 2: الضغط على الطلب يفتح صفحة تفاصيله الكاملة.
                        onTap: () => _openDetail(o),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                CircleAvatar(
                                  radius: 20,
                                  backgroundColor: color.withValues(alpha: 0.12),
                                  child: Icon(
                                    isStore ? Icons.restaurant : Icons.receipt_long,
                                    color: color,
                                    size: 20,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        // Card 28: بعد التسليم نعرض السعر الحقيقي لا التقريبي
                                        '#${id.substring(id.length - 5)} · ${_shownPrice(o)} ₪',
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w700,
                                          fontSize: 15,
                                        ),
                                      ),
                                      if (isStore)
                                        Text(
                                          '${o['store']['name']}',
                                          style: const TextStyle(
                                            color: YallaColors.muted,
                                            fontSize: 12,
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                                StatusPill(label, tone: tone),
                              ],
                            ),
                            const SizedBox(height: 10),
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Icon(Icons.route_outlined, size: 16, color: YallaColors.muted),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: Text(
                                    '${o['pickup']?['address']} ← ${o['dropoff']?['address']}',
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      color: YallaColors.onSurfaceVariant,
                                      fontSize: 13,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            // Card 48/51: اسم الكابتن الأول لكل طلب مُسنَد
                            if (o['captain'] != null && firstName(o['captain']?['name']).isNotEmpty) ...[
                              const SizedBox(height: 6),
                              Row(
                                children: [
                                  const Icon(Icons.person_outline, size: 16, color: YallaColors.muted),
                                  const SizedBox(width: 6),
                                  Text(
                                    'الكابتن: ${firstName(o['captain']?['name'])}',
                                    style: const TextStyle(color: YallaColors.muted, fontSize: 13),
                                  ),
                                ],
                              ),
                            ],
                            // إجراءات: دردشة أثناء التوصيل (Card 26)، أو تقييم بعد التسليم
                            if (_canChat(o) || (delivered && !rated) || rated) ...[
                              const Divider(height: 20),
                              Row(
                                children: [
                                  if (_canChat(o))
                                    TextButton.icon(
                                      onPressed: () => _openChat(o),
                                      icon: const Icon(Icons.chat_bubble_outline, size: 18),
                                      label: const Text('محادثة الكابتن'),
                                    ),
                                  if (delivered && !rated)
                                    TextButton.icon(
                                      onPressed: () => _rate(o),
                                      icon: const Icon(Icons.star_border, size: 18),
                                      label: const Text('قيّم الكابتن'),
                                    ),
                                  if (rated)
                                    Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        const Icon(Icons.star, size: 16, color: Colors.amber),
                                        const SizedBox(width: 4),
                                        Text(
                                          'تقييمك: ${o['rating']['stars']}',
                                          style: const TextStyle(color: YallaColors.muted, fontSize: 13),
                                        ),
                                      ],
                                    ),
                                  const Spacer(),
                                  const Icon(Icons.chevron_left, color: YallaColors.muted),
                                ],
                              ),
                            ],
                          ],
                        ),
                      );
                    },
                  ),
      ),
    );
  }
}
