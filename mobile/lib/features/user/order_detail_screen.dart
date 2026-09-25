// شاشة تفاصيل الطلب — ملخص واضح، متجر، ومسار حالة ديناميكي.

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../core/config/app_config.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/util/names.dart';
import '../restaurants/data/restaurant_repository.dart';
import '../restaurants/presentation/restaurant_menu_screen.dart';

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
  bool _openingStore = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await widget.api.get('/orders/${widget.orderId}');
      if (mounted) setState(() => _order = Map<String, dynamic>.from(data as Map));
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  num _shownPrice() {
    final finalPrice = _order!['finalPrice'] as num? ?? 0;
    return _order!['status'] == 'delivered' && finalPrice > 0
        ? finalPrice
        : (_order!['price'] as num? ?? 0);
  }

  String _priceLabel() =>
      _order!['status'] == 'delivered' ? 'السعر النهائي' : 'السعر التقريبي';

  String _statusLabel(String s) => switch (s) {
        'pending' => 'بانتظار كابتن',
        'assigned' => 'تم تعيين كابتن',
        'accepted' => 'الكابتن في الطريق',
        'picked_up' => 'جارٍ التوصيل',
        'delivered' => 'تم التسليم',
        'cancelled' => 'ملغى',
        _ => s,
      };

  Color _statusColor(String s) => switch (s) {
        'pending' => YallaColors.statusPending,
        'assigned' => YallaColors.statusAssigned,
        'accepted' || 'picked_up' => YallaColors.statusInTransit,
        'delivered' => YallaColors.statusDelivered,
        'cancelled' => YallaColors.statusCancelled,
        _ => YallaColors.muted,
      };

  String _shortId() {
    final id = (_order!['_id'] ?? '').toString();
    if (id.isEmpty) return '';
    return '#${id.length > 5 ? id.substring(id.length - 5) : id}';
  }

  String _address(String key) {
    final data = _order![key];
    if (data is! Map) return '';
    final address = (data['address'] ?? '').toString().trim();
    if (address.isNotEmpty) return address;
    return [data['city'], data['neighborhood'], data['street']]
        .where((e) => e != null && e.toString().trim().isNotEmpty)
        .join('، ');
  }

  String _fmt(String? iso) {
    if (iso == null) return '';
    final d = DateTime.tryParse(iso)?.toLocal();
    if (d == null) return '';
    final hour = d.hour % 12 == 0 ? 12 : d.hour % 12;
    final minute = d.minute.toString().padLeft(2, '0');
    final suffix = d.hour < 12 ? 'ص' : 'م';
    return '$hour:$minute $suffix';
  }

  String _createdLabel() {
    final raw = (_order!['createdAt'] ?? _order!['created_at'] ?? '').toString();
    final d = DateTime.tryParse(raw)?.toLocal();
    if (d == null) return '';
    return '${d.day}/${d.month}/${d.year} · ${_fmt(raw)}';
  }

  String _cancelReason() {
    for (final key in const ['cancelReason', 'cancellationReason', 'statusReason']) {
      final v = (_order![key] ?? '').toString().trim();
      if (v.isNotEmpty) return v;
    }
    return '';
  }

  Future<void> _openStore() async {
    final raw = _order!['store']?['restaurant'];
    final id = raw is Map
        ? (raw['_id'] ?? raw['id'] ?? '').toString()
        : (raw ?? '').toString();
    if (id.isEmpty || _openingStore) return;

    setState(() => _openingStore = true);
    try {
      final result = await RestaurantRepository(widget.api).getWithMenu(id);
      if (!mounted) return;
      await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => RestaurantMenuScreen(api: widget.api, restaurant: result.$1),
      ));
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _openingStore = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('تفاصيل الطلب')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _order == null
              ? const Center(child: Text('تعذّر تحميل الطلب'))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 10, 16, 28),
                    children: [
                      _summaryCard(),
                      if (_order!['store']?['restaurant'] != null) ...[
                        const SizedBox(height: 14),
                        _storeCard(),
                      ],
                      const SizedBox(height: 20),
                      const Text(
                        'مسار الطلب',
                        style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
                      ),
                      const SizedBox(height: 12),
                      ..._buildTimeline(),
                    ],
                  ),
                ),
    );
  }

  Widget _summaryCard() {
    final status = (_order!['status'] ?? '').toString();
    final color = _statusColor(status);
    final captain = firstName(_order!['captain']?['name']);
    final reason = _cancelReason();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(
          color: Theme.of(context).colorScheme.outlineVariant.withValues(alpha: .7),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: .12),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(
                  status == 'delivered'
                      ? Icons.check_circle_rounded
                      : status == 'cancelled'
                          ? Icons.cancel_rounded
                          : Icons.local_shipping_outlined,
                  color: color,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _statusLabel(status),
                      style: TextStyle(
                        color: color,
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Wrap(
                      spacing: 8,
                      children: [
                        Text(
                          _shortId(),
                          textDirection: TextDirection.ltr,
                          style: TextStyle(color: YallaColors.muted),
                        ),
                        if (_createdLabel().isNotEmpty)
                          Text(_createdLabel(), style: TextStyle(color: YallaColors.muted)),
                      ],
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '${_shownPrice()} ₪',
                    textDirection: TextDirection.ltr,
                    style: TextStyle(
                      color: YallaColors.primary,
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  Text(_priceLabel(), style: TextStyle(color: YallaColors.muted, fontSize: 11)),
                ],
              ),
            ],
          ),
          const SizedBox(height: 18),
          _routeBlock(),
          if (captain.isNotEmpty) ...[
            const Divider(height: 24),
            _captainRow(),
          ],
          if ((_order!['deliveryCode'] ?? '').toString().isNotEmpty &&
              status != 'delivered' &&
              status != 'cancelled') ...[
            const Divider(height: 24),
            _infoRow(
              Icons.password_rounded,
              'رمز التسليم',
              _order!['deliveryCode'].toString(),
              emphasize: true,
            ),
          ],
          if (status == 'cancelled' && reason.isNotEmpty) ...[
            const Divider(height: 24),
            _infoRow(Icons.info_outline_rounded, 'سبب الإلغاء', reason),
          ],
        ],
      ),
    );
  }

  Widget _routeBlock() => Column(
        children: [
          _routePoint(Icons.radio_button_checked_rounded, 'الاستلام', _address('pickup')),
          Padding(
            padding: const EdgeInsetsDirectional.only(start: 10),
            child: Align(
              alignment: AlignmentDirectional.centerStart,
              child: Container(
                margin: const EdgeInsetsDirectional.only(start: 8),
                height: 18,
                width: 2,
                color: YallaColors.muted.withValues(alpha: .25),
              ),
            ),
          ),
          _routePoint(Icons.location_on_rounded, 'التسليم', _address('dropoff')),
        ],
      );

  Widget _routePoint(IconData icon, String label, String value) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: YallaColors.primary),
          const SizedBox(width: 10),
          SizedBox(
            width: 58,
            child: Text(label, style: TextStyle(color: YallaColors.muted, fontSize: 12)),
          ),
          Expanded(
            child: Text(
              value.isEmpty ? 'غير محدد' : value,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
        ],
      );

  List<Widget> _buildTimeline() {
    final rawSteps = (_order!['timelineSteps'] as List?) ?? const [];
    final steps = rawSteps.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    final currentStatus = (_order!['status'] ?? '').toString();
    const statusAliases = {
      'assigned': 'assigned',
      'accepted': 'accepted',
      'picked_up': 'picked_up',
      'delivered': 'delivered',
      'cancelled': 'cancelled',
      'pending': 'pending',
    };

    return List.generate(steps.length, (i) {
      final s = steps[i];
      final key = (s['key'] ?? '').toString();
      final done = s['done'] == true;
      final cancelled = key == 'cancelled';
      final current = key == statusAliases[currentStatus] && currentStatus != 'delivered';
      final color = cancelled
          ? YallaColors.statusCancelled
          : current
              ? YallaColors.primary
              : done
                  ? YallaColors.statusDelivered
                  : YallaColors.muted.withValues(alpha: .55);
      final isLast = i == steps.length - 1;

      return IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Column(
              children: [
                Icon(
                  cancelled
                      ? Icons.cancel_rounded
                      : current
                          ? Icons.radio_button_checked_rounded
                          : done
                              ? Icons.check_circle_rounded
                              : Icons.radio_button_unchecked_rounded,
                  color: color,
                  size: 23,
                ),
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 2,
                      color: done
                          ? YallaColors.statusDelivered.withValues(alpha: .25)
                          : Theme.of(context).colorScheme.outlineVariant,
                    ),
                  ),
              ],
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.only(bottom: 18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      (s['label'] ?? '').toString(),
                      style: TextStyle(
                        color: color,
                        fontWeight: current || done ? FontWeight.w800 : FontWeight.w500,
                        fontSize: current ? 15 : 14,
                      ),
                    ),
                    if (s['at'] != null) ...[
                      const SizedBox(height: 2),
                      Text(_fmt(s['at'].toString()),
                          style: TextStyle(color: YallaColors.muted, fontSize: 12)),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      );
    });
  }

  Widget _storeCard() {
    final store = Map<String, dynamic>.from(_order!['store'] as Map);
    final items = (store['items'] as List?) ?? const [];
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(
          color: Theme.of(context).colorScheme.outlineVariant.withValues(alpha: .7),
        ),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: YallaColors.primary.withValues(alpha: .10),
                  borderRadius: BorderRadius.circular(13),
                ),
                child: Icon(Icons.storefront_rounded, color: YallaColors.primary),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  (store['name'] ?? '').toString(),
                  style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900),
                ),
              ),
              TextButton.icon(
                onPressed: _openingStore ? null : _openStore,
                icon: _openingStore
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.storefront_outlined, size: 18),
                label: Text(_order!['status'] == 'delivered' ? 'إعادة الطلب' : 'فتح المتجر'),
              ),
            ],
          ),
          const Divider(height: 22),
          ...items.map((raw) {
            final item = Map<String, dynamic>.from(raw as Map);
            final qty = (item['qty'] as num?) ?? 1;
            final price = (item['price'] as num?) ?? 0;
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      '${qty.toInt()}× ${item['name'] ?? ''}',
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ),
                  Text(
                    '${price * qty} ₪',
                    textDirection: TextDirection.ltr,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ],
              ),
            );
          }),
          if ((store['note'] ?? '').toString().trim().isNotEmpty) ...[
            const SizedBox(height: 8),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: Text(
                'ملاحظة: ${store['note']}',
                style: TextStyle(color: YallaColors.muted),
              ),
            ),
          ],
          const Divider(height: 22),
          Row(
            children: [
              const Text('قيمة الأصناف', style: TextStyle(fontWeight: FontWeight.w900)),
              const Spacer(),
              Text(
                '${store['itemsTotal'] ?? 0} ₪',
                textDirection: TextDirection.ltr,
                style: const TextStyle(fontWeight: FontWeight.w900),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _infoRow(IconData icon, String label, String value, {bool emphasize = false}) => Row(
        children: [
          Icon(icon, size: 20, color: YallaColors.primary),
          const SizedBox(width: 10),
          Text(label, style: TextStyle(color: YallaColors.muted)),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: TextStyle(
                fontSize: emphasize ? 18 : 14,
                fontWeight: emphasize ? FontWeight.w900 : FontWeight.w600,
              ),
            ),
          ),
        ],
      );

  String? _captainAvatarUrl() {
    final url = (_order!['captain']?['avatarUrl'] ?? '').toString();
    if (url.isEmpty) return null;
    return url.startsWith('http') ? url : '${AppConfig.origin}$url';
  }

  Widget _captainRow() {
    final avatar = _captainAvatarUrl();
    return Row(
      children: [
        CircleAvatar(
          radius: 20,
          backgroundImage: avatar != null ? CachedNetworkImageProvider(avatar) : null,
          child: avatar == null ? const Icon(Icons.person, size: 20) : null,
        ),
        const SizedBox(width: 10),
        Text('الكابتن', style: TextStyle(color: YallaColors.muted)),
        const Spacer(),
        Text(
          firstName(_order!['captain']?['name']),
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
      ],
    );
  }
}
