// شاشة "طلباتي" — فلترة، ترتيب، حالات واضحة وإجراءات سريعة.

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/network/api_client.dart';
import '../../core/realtime/socket_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/util/names.dart';
import '../../core/widgets/ui.dart';
import '../chat/chat_screen.dart';
import '../restaurants/data/restaurant_repository.dart';
import '../restaurants/presentation/restaurant_menu_screen.dart';
import 'order_detail_screen.dart';
import 'order_tracking_screen.dart';
import 'rate_order_dialog.dart';

enum _OrderFilter { all, active, completed, cancelled }

class MyOrdersScreen extends StatefulWidget {
  final ApiClient api;
  final SocketService socket;
  const MyOrdersScreen({super.key, required this.api, required this.socket});

  @override
  State<MyOrdersScreen> createState() => _MyOrdersScreenState();
}

class _MyOrdersScreenState extends State<MyOrdersScreen> {
  static const _pageSize = 20;
  static const _activeStatuses = {'pending', 'assigned', 'accepted', 'picked_up'};

  final _scrollController = ScrollController();
  List<dynamic> _orders = [];
  bool _loading = true;
  bool _loadingMore = false;
  bool _hasMore = true;
  _OrderFilter _filter = _OrderFilter.all;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_maybeLoadMore);
    _load();
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _load({bool reset = true}) async {
    if (!reset && (_loadingMore || !_hasMore)) return;
    final skip = reset ? 0 : _orders.length;
    setState(() {
      if (reset) {
        _loading = _orders.isEmpty;
        _hasMore = true;
      } else {
        _loadingMore = true;
      }
    });
    try {
      final data = await widget.api.get('/orders/mine?limit=$_pageSize&skip=$skip');
      final page = List<dynamic>.from(data as List);
      if (!mounted) return;
      setState(() {
        if (reset) {
          _orders = page;
        } else {
          final seen = _orders
              .whereType<Map>()
              .map((e) => e['_id']?.toString())
              .whereType<String>()
              .toSet();
          _orders.addAll(page.where(
            (e) => e is! Map || !seen.contains(e['_id']?.toString()),
          ));
        }
        _hasMore = page.length >= _pageSize;
      });
    } on ApiException catch (e) {
      _message(e.message);
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
          _loadingMore = false;
        });
      }
    }
  }

  void _maybeLoadMore() {
    if (!_scrollController.hasClients || _loadingMore || !_hasMore) return;
    final p = _scrollController.position;
    if (p.maxScrollExtent > 0 && p.pixels >= p.maxScrollExtent * .75) {
      _load(reset: false);
    }
  }

  List<Map<String, dynamic>> get _visibleOrders {
    final rows = _orders
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .where((o) {
      final s = (o['status'] ?? '').toString();
      return switch (_filter) {
        _OrderFilter.all => true,
        _OrderFilter.active => _activeStatuses.contains(s),
        _OrderFilter.completed => s == 'delivered',
        _OrderFilter.cancelled => s == 'cancelled',
      };
    }).toList();

    int bucket(Map<String, dynamic> o) {
      final s = (o['status'] ?? '').toString();
      if (_activeStatuses.contains(s)) return 0;
      if (s == 'delivered') return 1;
      if (s == 'cancelled') return 2;
      return 3;
    }

    rows.sort((a, b) {
      final byBucket = bucket(a).compareTo(bucket(b));
      if (byBucket != 0) return byBucket;
      return _createdAt(b).compareTo(_createdAt(a));
    });
    return rows;
  }

  Future<void> _rate(Map<String, dynamic> order) async {
    final done = await showDialog<bool>(
      context: context,
      builder: (_) => RateOrderDialog(api: widget.api, orderId: order['_id']),
    );
    if (done == true) _load();
  }

  Future<void> _openDetail(Map<String, dynamic> o) async {
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => OrderDetailScreen(
        api: widget.api,
        orderId: o['_id'] as String,
      ),
    ));
    if (mounted) _load();
  }

  void _openTracking(Map<String, dynamic> o) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => OrderTrackingScreen(
        orderId: o['_id'] as String,
        api: widget.api,
        socket: widget.socket,
      ),
    ));
  }

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
        peerAvatarUrl: captain?['avatarUrl'] as String?,
      ),
    ));
  }

  Future<void> _callCaptain(Map<String, dynamic> o) async {
    final phone = (o['captain']?['phone'] ?? '').toString().trim();
    if (phone.isEmpty) {
      _message('رقم الكابتن غير متاح لهذا الطلب');
      return;
    }
    if (!await launchUrl(Uri(scheme: 'tel', path: phone))) {
      _message('تعذّر فتح تطبيق الاتصال');
    }
  }

  Future<void> _openRestaurant(Map<String, dynamic> o) async {
    final raw = o['store']?['restaurant'];
    final id = raw is Map
        ? (raw['_id'] ?? raw['id'] ?? '').toString()
        : (raw ?? '').toString();
    if (id.isEmpty) {
      _message('تعذّر العثور على المتجر لهذا الطلب');
      return;
    }
    try {
      final result = await RestaurantRepository(widget.api).getWithMenu(id);
      if (!mounted) return;
      await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => RestaurantMenuScreen(
          api: widget.api,
          restaurant: result.$1,
        ),
      ));
    } on ApiException catch (e) {
      _message(e.message);
    }
  }

  void _message(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  num _shownPrice(Map<String, dynamic> o) {
    final finalPrice = o['finalPrice'] as num? ?? 0;
    return o['status'] == 'delivered' && finalPrice > 0
        ? finalPrice
        : (o['price'] as num? ?? 0);
  }

  (String, Color, PillTone) _statusMeta(String s) => switch (s) {
        'pending' => ('بانتظار كابتن', YallaColors.statusPending, PillTone.neutral),
        'assigned' => ('تم تعيين كابتن', YallaColors.statusAssigned, PillTone.info),
        'accepted' => ('الكابتن في الطريق', YallaColors.statusInTransit, PillTone.brand),
        'picked_up' => ('جارٍ التوصيل', YallaColors.statusInTransit, PillTone.brand),
        'delivered' => ('تم التسليم', YallaColors.statusDelivered, PillTone.success),
        'cancelled' => ('ملغى', YallaColors.statusCancelled, PillTone.danger),
        _ => (s, YallaColors.muted, PillTone.neutral),
      };

  String _shortId(Map<String, dynamic> o) {
    final id = (o['_id'] ?? '').toString();
    if (id.isEmpty) return '';
    return '#${id.length > 5 ? id.substring(id.length - 5) : id}';
  }

  DateTime _createdAt(Map<String, dynamic> o) {
    for (final key in const ['createdAt', 'created_at', 'placedAt']) {
      final d = DateTime.tryParse((o[key] ?? '').toString());
      if (d != null) return d.toLocal();
    }
    return DateTime.fromMillisecondsSinceEpoch(0);
  }

  String _dateLabel(Map<String, dynamic> o) {
    final d = _createdAt(o);
    if (d.millisecondsSinceEpoch == 0) return '';
    final now = DateTime.now();
    final today = now.year == d.year && now.month == d.month && now.day == d.day;
    final yesterday = DateTime(now.year, now.month, now.day).subtract(const Duration(days: 1));
    final isYesterday =
        yesterday.year == d.year && yesterday.month == d.month && yesterday.day == d.day;
    final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
    final m = d.minute.toString().padLeft(2, '0');
    final suffix = d.hour < 12 ? 'ص' : 'م';
    final time = '$h:$m $suffix';
    if (today) return 'اليوم · $time';
    if (isYesterday) return 'أمس · $time';
    return '${d.day}/${d.month}/${d.year} · $time';
  }

  String _address(Map<String, dynamic> o, String key) {
    final data = o[key];
    if (data is! Map) return '';
    final address = (data['address'] ?? '').toString().trim();
    if (address.isNotEmpty) return address;
    return [data['city'], data['neighborhood'], data['street']]
        .where((e) => e != null && e.toString().trim().isNotEmpty)
        .join('، ');
  }

  String _cancelReason(Map<String, dynamic> o) {
    for (final key in const ['cancelReason', 'cancellationReason', 'statusReason']) {
      final value = (o[key] ?? '').toString().trim();
      if (value.isNotEmpty) return value;
    }
    return '';
  }

  String _etaText(Map<String, dynamic> o) {
    final eta = o['etaMinutes'];
    return eta is num && eta > 0 ? 'متوقع خلال ~${eta.toInt()} دقيقة' : '';
  }

  int _count(_OrderFilter filter) {
    return _orders.whereType<Map>().where((o) {
      final s = (o['status'] ?? '').toString();
      return switch (filter) {
        _OrderFilter.all => true,
        _OrderFilter.active => _activeStatuses.contains(s),
        _OrderFilter.completed => s == 'delivered',
        _OrderFilter.cancelled => s == 'cancelled',
      };
    }).length;
  }

  @override
  Widget build(BuildContext context) {
    final visible = _visibleOrders;
    return Scaffold(
      appBar: AppBar(toolbarHeight: 0),
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
                : CustomScrollView(
                    controller: _scrollController,
                    slivers: [
                      SliverToBoxAdapter(child: _header()),
                      SliverToBoxAdapter(child: _filters()),
                      if (visible.isEmpty)
                        const SliverFillRemaining(
                          hasScrollBody: false,
                          child: EmptyStateView(
                            icon: Icons.filter_alt_off_outlined,
                            title: 'لا توجد طلبات في هذا القسم',
                            message: 'جرّب اختيار قسم آخر أو اسحب للتحديث.',
                          ),
                        )
                      else
                        SliverPadding(
                          padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                          sliver: SliverList.separated(
                            itemCount: visible.length + (_loadingMore ? 1 : 0),
                            separatorBuilder: (_, __) => const SizedBox(height: 10),
                            itemBuilder: (_, i) {
                              if (i >= visible.length) {
                                return const Padding(
                                  padding: EdgeInsets.symmetric(vertical: 16),
                                  child: Center(child: CircularProgressIndicator()),
                                );
                              }
                              return _orderCard(visible[i]);
                            },
                          ),
                        ),
                    ],
                  ),
      ),
    );
  }

  Widget _header() => Padding(
        padding: const EdgeInsets.fromLTRB(16, 18, 16, 10),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: YallaColors.primary.withValues(alpha: .10),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(Icons.receipt_long_rounded, color: YallaColors.primary),
            ),
            const SizedBox(width: 12),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('طلباتي', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
                  SizedBox(height: 2),
                  Text('تابع طلباتك الحالية وارجع لطلباتك السابقة.'),
                ],
              ),
            ),
          ],
        ),
      );

  Widget _filters() {
    final entries = const [
      (_OrderFilter.all, 'الكل'),
      (_OrderFilter.active, 'قيد التنفيذ'),
      (_OrderFilter.completed, 'مكتملة'),
      (_OrderFilter.cancelled, 'ملغاة'),
    ];
    return SizedBox(
      height: 54,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        scrollDirection: Axis.horizontal,
        itemCount: entries.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final (value, label) = entries[i];
          final count = _count(value);
          return ChoiceChip(
            selected: _filter == value,
            onSelected: (_) => setState(() => _filter = value),
            avatar: _filter == value ? const Icon(Icons.check_rounded, size: 17) : null,
            label: Text('$label${count > 0 ? '  $count' : ''}'),
          );
        },
      ),
    );
  }

  Widget _orderCard(Map<String, dynamic> o) {
    final status = (o['status'] ?? '').toString();
    final (label, color, tone) = _statusMeta(status);
    final active = _activeStatuses.contains(status);
    final delivered = status == 'delivered';
    final cancelled = status == 'cancelled';
    final rated = o['rating']?['stars'] != null;
    final isStore = o['store']?['restaurant'] != null;
    final storeName = (o['store']?['name'] ?? '').toString().trim();
    final captain = firstName(o['captain']?['name']);
    final date = _dateLabel(o);
    final reason = _cancelReason(o);
    final eta = _etaText(o);

    return YallaCard(
      onTap: () => _openDetail(o),
      child: Opacity(
        opacity: cancelled ? .82 : 1,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CircleAvatar(
                  radius: 22,
                  backgroundColor: color.withValues(alpha: .12),
                  child: Icon(
                    isStore ? Icons.restaurant_rounded : Icons.local_shipping_outlined,
                    color: color,
                    size: 21,
                  ),
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        isStore && storeName.isNotEmpty ? storeName : 'طلب توصيل Yalla',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900),
                      ),
                      const SizedBox(height: 3),
                      Wrap(
                        spacing: 8,
                        children: [
                          Text(
                            _shortId(o),
                            textDirection: TextDirection.ltr,
                            style: TextStyle(color: YallaColors.muted, fontSize: 12),
                          ),
                          if (date.isNotEmpty)
                            Text(date, style: TextStyle(color: YallaColors.muted, fontSize: 12)),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                StatusPill(label, tone: tone),
              ],
            ),
            if (active) ...[
              const SizedBox(height: 10),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: .08),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  eta.isNotEmpty ? '$label · $eta' : label,
                  style: TextStyle(color: color, fontSize: 13, fontWeight: FontWeight.w800),
                ),
              ),
            ],
            const SizedBox(height: 11),
            _routeRow(_address(o, 'pickup'), _address(o, 'dropoff')),
            if (captain.isNotEmpty) ...[
              const SizedBox(height: 7),
              Row(
                children: [
                  Icon(Icons.person_outline, size: 16, color: YallaColors.muted),
                  const SizedBox(width: 6),
                  Text('الكابتن: $captain',
                      style: TextStyle(color: YallaColors.muted, fontSize: 13)),
                ],
              ),
            ],
            if (cancelled && reason.isNotEmpty) ...[
              const SizedBox(height: 7),
              Text(
                'سبب الإلغاء: $reason',
                style: TextStyle(
                  color: YallaColors.statusCancelled,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
            const SizedBox(height: 10),
            Row(
              children: [
                Text(
                  '${_shownPrice(o)} ₪',
                  textDirection: TextDirection.ltr,
                  style: TextStyle(
                    color: active ? YallaColors.primary : Theme.of(context).colorScheme.onSurface,
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const Spacer(),
                if (delivered && rated) ...[
                  const Icon(Icons.star_rounded, size: 17, color: Colors.amber),
                  const SizedBox(width: 4),
                  Text('تم التقييم', style: TextStyle(color: YallaColors.muted, fontSize: 12)),
                ],
                Icon(Icons.chevron_left_rounded, color: YallaColors.muted),
              ],
            ),
            if (active || delivered) ...[
              const Divider(height: 20),
              Wrap(
                spacing: 4,
                runSpacing: 2,
                children: [
                  if (active)
                    TextButton.icon(
                      onPressed: () => _openTracking(o),
                      icon: const Icon(Icons.near_me_outlined, size: 18),
                      label: const Text('تتبع'),
                    ),
                  if (active && o['captain'] != null)
                    TextButton.icon(
                      onPressed: () => _callCaptain(o),
                      icon: const Icon(Icons.call_outlined, size: 18),
                      label: const Text('اتصال'),
                    ),
                  if (active && o['captain'] != null)
                    TextButton.icon(
                      onPressed: () => _openChat(o),
                      icon: const Icon(Icons.chat_bubble_outline, size: 18),
                      label: const Text('محادثة'),
                    ),
                  if (delivered && !rated)
                    TextButton.icon(
                      onPressed: () => _rate(o),
                      icon: const Icon(Icons.star_border_rounded, size: 18),
                      label: const Text('تقييم'),
                    ),
                  if (delivered && isStore)
                    TextButton.icon(
                      onPressed: () => _openRestaurant(o),
                      icon: const Icon(Icons.replay_rounded, size: 18),
                      label: const Text('إعادة الطلب'),
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _routeRow(String pickup, String dropoff) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 20,
            child: Column(
              children: [
                Icon(Icons.circle, size: 9, color: YallaColors.primary),
                Container(
                  height: 19,
                  width: 2,
                  color: YallaColors.muted.withValues(alpha: .25),
                ),
                Icon(Icons.location_on_rounded, size: 17, color: YallaColors.primary),
              ],
            ),
          ),
          const SizedBox(width: 7),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  pickup.isEmpty ? 'نقطة الاستلام' : pickup,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 9),
                Text(
                  dropoff.isEmpty ? 'نقطة التسليم' : dropoff,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: YallaColors.onSurfaceVariant, fontSize: 13),
                ),
              ],
            ),
          ),
        ],
      );
}
