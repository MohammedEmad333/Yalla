// شاشة الإشعارات — بطاقات متوافقة مع الوضع الليلي مع تفاصيل وإجراءات واضحة.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/network/api_client.dart';
import '../../core/realtime/socket_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/ui.dart';

class NotificationsScreen extends StatefulWidget {
  final ApiClient api;
  final SocketService? socket;
  const NotificationsScreen({super.key, required this.api, this.socket});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<dynamic> _items = [];
  int _unread = 0;
  bool _loading = true;
  void Function()? _notificationUnsubscribe;

  @override
  void initState() {
    super.initState();
    _load();
    _notificationUnsubscribe = widget.socket?.onNotificationNew((notif) {
      if (!mounted) return;
      setState(() {
        _items = [notif, ..._items];
        if (notif['read'] != true) _unread += 1;
      });
    });
  }

  @override
  void dispose() {
    _notificationUnsubscribe?.call();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await widget.api.get('/notifications');
      if (!mounted) return;
      setState(() {
        _items = data['items'] as List;
        _unread = data['unread'] ?? 0;
      });
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _markRead(Map<String, dynamic> n) async {
    if (n['read'] == true) return;
    await widget.api.patch('/notifications/${n['_id']}/read', {});
    if (!mounted) return;
    setState(() {
      n['read'] = true;
      if (_unread > 0) _unread--;
    });
  }

  Future<void> _openDetails(Map<String, dynamic> n) async {
    await _markRead(n);
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _NotificationDetails(n: n, iconFor: _iconFor),
    );
  }

  Future<void> _markAll() async {
    await widget.api.patch('/notifications/read-all', {});
    if (!mounted) return;
    setState(() {
      _unread = 0;
      for (final raw in _items) {
        if (raw is Map) raw['read'] = true;
      }
    });
  }

  IconData _iconFor(String type) => switch (type) {
        'ORDER_ASSIGNED' => Icons.assignment_turned_in_outlined,
        'ORDER_STATUS' => Icons.local_shipping_outlined,
        'ORDER_CANCELLED' => Icons.cancel_outlined,
        'DELIVERY_CODE' => Icons.key_outlined,
        'WITHDRAWAL_DONE' => Icons.account_balance_wallet_outlined,
        'WITHDRAWAL_REJECTED' => Icons.money_off_csred_outlined,
        'ADMIN_MESSAGE' => Icons.campaign_outlined,
        _ => Icons.notifications_outlined,
      };

  Color _tone(String type, bool admin) {
    if (admin) return const Color(0xFF6D5DFB);
    return switch (type) {
      'ORDER_CANCELLED' || 'WITHDRAWAL_REJECTED' => YallaColors.error,
      'WITHDRAWAL_DONE' => YallaColors.success,
      'DELIVERY_CODE' => YallaColors.warning,
      _ => YallaColors.primary,
    };
  }

  String _when(dynamic raw) {
    final d = DateTime.tryParse((raw ?? '').toString())?.toLocal();
    if (d == null) return '';
    final now = DateTime.now();
    final sameDay =
        now.year == d.year && now.month == d.month && now.day == d.day;
    final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
    final m = d.minute.toString().padLeft(2, '0');
    final suffix = d.hour < 12 ? 'ص' : 'م';
    if (sameDay) return 'اليوم · $h:$m $suffix';
    return '${d.day}/${d.month}/${d.year} · $h:$m $suffix';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_unread > 0 ? 'الإشعارات ($_unread)' : 'الإشعارات'),
        actions: [
          if (_unread > 0)
            TextButton.icon(
              onPressed: _markAll,
              icon: const Icon(Icons.done_all_rounded, size: 18),
              label: const Text('تعليم الكل'),
            ),
        ],
      ),
      body: _loading
          ? const LoadingView()
          : _items.isEmpty
              ? const EmptyStateView(
                  icon: Icons.notifications_none_rounded,
                  title: 'لا توجد إشعارات',
                  message: 'ستظهر هنا تحديثات طلباتك ورسائل الإدارة.',
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                    itemCount: _items.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (_, i) {
                      final n = Map<String, dynamic>.from(_items[i] as Map);
                      final unread = n['read'] != true;
                      final fromAdmin =
                          n['data'] is Map && n['data']['fromAdmin'] == true;
                      final type = (n['type'] ?? '').toString();
                      final color = _tone(type, fromAdmin);
                      return Material(
                        color: Colors.transparent,
                        child: InkWell(
                          borderRadius: BorderRadius.circular(18),
                          onTap: () => _openDetails(n),
                          child: Container(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: unread
                                  ? color.withValues(alpha: .07)
                                  : YallaColors.card,
                              borderRadius: BorderRadius.circular(18),
                              border: Border.all(
                                color: unread
                                    ? color.withValues(alpha: .35)
                                    : YallaColors.outline,
                              ),
                            ),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Container(
                                  width: 42,
                                  height: 42,
                                  decoration: BoxDecoration(
                                    color: color.withValues(alpha: .12),
                                    borderRadius: BorderRadius.circular(13),
                                  ),
                                  child: Icon(
                                    fromAdmin
                                        ? Icons.admin_panel_settings_outlined
                                        : _iconFor(type),
                                    color: color,
                                    size: 21,
                                  ),
                                ),
                                const SizedBox(width: 11),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          Expanded(
                                            child: Text(
                                              (n['title'] ?? '').toString(),
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              style: TextStyle(
                                                fontWeight: unread
                                                    ? FontWeight.w900
                                                    : FontWeight.w700,
                                                fontSize: 15,
                                              ),
                                            ),
                                          ),
                                          if (unread)
                                            Container(
                                              width: 8,
                                              height: 8,
                                              decoration: BoxDecoration(
                                                color: color,
                                                shape: BoxShape.circle,
                                              ),
                                            ),
                                        ],
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        (n['body'] ?? '').toString(),
                                        maxLines: 2,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(
                                          color: YallaColors.onSurfaceVariant,
                                          height: 1.45,
                                          fontSize: 13,
                                        ),
                                      ),
                                      const SizedBox(height: 7),
                                      Wrap(
                                        spacing: 7,
                                        runSpacing: 4,
                                        children: [
                                          if (fromAdmin)
                                            _miniChip(
                                              'رسالة من الإدارة',
                                              color,
                                            ),
                                          if (_when(n['createdAt']).isNotEmpty)
                                            Text(
                                              _when(n['createdAt']),
                                              style: TextStyle(
                                                color: YallaColors.muted,
                                                fontSize: 11,
                                              ),
                                            ),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Icon(
                                  Icons.chevron_left_rounded,
                                  color: YallaColors.muted,
                                  size: 20,
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
    );
  }

  Widget _miniChip(String text, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: color.withValues(alpha: .10),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(
          text,
          style: TextStyle(
            color: color,
            fontSize: 10,
            fontWeight: FontWeight.w800,
          ),
        ),
      );
}

class _NotificationDetails extends StatelessWidget {
  final Map<String, dynamic> n;
  final IconData Function(String) iconFor;
  const _NotificationDetails({required this.n, required this.iconFor});

  String get _typeLabel => switch (n['type'] as String? ?? '') {
        'ORDER_ASSIGNED' => 'طلب مُسنَد إليك',
        'ORDER_STATUS' => 'تحديث حالة الطلب',
        'ORDER_CANCELLED' => 'إلغاء طلب',
        'DELIVERY_CODE' => 'رمز تسليم',
        'WITHDRAWAL_DONE' => 'تحويل أموال',
        'WITHDRAWAL_REJECTED' => 'رفض طلب سحب',
        'ADMIN_MESSAGE' => 'رسالة من المشرف',
        _ => 'إشعار',
      };

  String _statusLabel(String s) => switch (s) {
        'pending' => 'قيد الانتظار',
        'assigned' => 'مُسنَد لكابتن',
        'accepted' => 'قبله الكابتن',
        'picked_up' => 'تمّ الاستلام',
        'delivered' => 'تمّ التسليم',
        'cancelled' => 'مُلغى',
        'rejected' => 'مرفوض',
        _ => s,
      };

  String _formatDate(String? iso) {
    final d = DateTime.tryParse(iso ?? '')?.toLocal();
    if (d == null) return '';
    String two(int v) => v.toString().padLeft(2, '0');
    return '${d.year}/${two(d.month)}/${two(d.day)} · ${two(d.hour)}:${two(d.minute)}';
  }

  Future<void> _copy(BuildContext context, String value, String label) async {
    await Clipboard.setData(ClipboardData(text: value));
    if (!context.mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text('تم نسخ $label')));
  }

  Future<void> _openStore() async {
    await launchUrl(
      Uri.parse('https://play.google.com'),
      mode: LaunchMode.externalApplication,
    );
  }

  @override
  Widget build(BuildContext context) {
    final data = n['data'] is Map
        ? Map<String, dynamic>.from(n['data'] as Map)
        : <String, dynamic>{};
    final orderId = data['orderId']?.toString();
    final status = data['status']?.toString();
    final code = data['code']?.toString();
    final when = _formatDate(n['createdAt']?.toString());
    final isAdmin = n['type'] == 'ADMIN_MESSAGE';

    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: YallaColors.primary.withValues(alpha: .10),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(
                    iconFor((n['type'] ?? '').toString()),
                    color: YallaColors.primary,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    (n['title'] ?? '').toString(),
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 6,
              children: [
                Chip(label: Text(_typeLabel)),
                if (when.isNotEmpty)
                  Chip(
                    avatar: const Icon(Icons.schedule_outlined, size: 16),
                    label: Text(when),
                  ),
              ],
            ),
            const Divider(height: 22),
            SelectableText(
              (n['body'] as String?)?.isNotEmpty == true
                  ? n['body']
                  : 'لا توجد تفاصيل إضافية',
              style: const TextStyle(fontSize: 15, height: 1.55),
            ),
            if (orderId != null || status != null || code != null) ...[
              const SizedBox(height: 14),
              if (code != null)
                _detailRow(
                  Icons.key_outlined,
                  'رمز التسليم',
                  code,
                  action: IconButton(
                    tooltip: 'نسخ الرمز',
                    onPressed: () => _copy(context, code, 'رمز التسليم'),
                    icon: const Icon(Icons.copy_rounded, size: 18),
                  ),
                ),
              if (status != null)
                _detailRow(
                  Icons.local_shipping_outlined,
                  'حالة الطلب',
                  _statusLabel(status),
                ),
              if (orderId != null)
                _detailRow(
                  Icons.receipt_long_outlined,
                  'رقم الطلب',
                  '#${orderId.length > 6 ? orderId.substring(orderId.length - 6) : orderId}',
                ),
            ],
            if (isAdmin) ...[
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: _openStore,
                  icon: const Icon(Icons.system_update_alt_rounded),
                  label: const Text('فتح Google Play'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _detailRow(
    IconData icon,
    String label,
    String value, {
    Widget? action,
  }) =>
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Row(
          children: [
            Icon(icon, size: 18, color: YallaColors.muted),
            const SizedBox(width: 8),
            Text('$label: ',
                style: TextStyle(color: YallaColors.muted, fontSize: 13)),
            Expanded(
              child: Text(
                value,
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
              ),
            ),
            if (action != null) action,
          ],
        ),
      );
}
