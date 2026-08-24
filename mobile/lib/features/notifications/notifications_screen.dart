// شاشة الإشعارات داخل التطبيق — مشتركة بين تطبيقَي المستخدم والكابتن.
// تعرض قائمة الإشعارات مع تمييز غير المقروء، وتعليم الكلّ/الواحد كمقروء.

import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../../core/realtime/socket_service.dart';

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

  @override
  void initState() {
    super.initState();
    _load();

    // إشعار داخلي جديد يصل لحظيًا (مثل إسناد طلب للكابتن) — نضيفه أعلى القائمة فورًا
    // دون تحديث الصفحة (Card 3: أرسل الإشعار فورًا للكابتن).
    widget.socket?.onNotificationNew((notif) {
      if (!mounted) return;
      setState(() {
        _items = [notif, ..._items];
        if (notif['read'] != true) _unread += 1;
      });
    });
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await widget.api.get('/notifications');
      setState(() {
        _items = data['items'] as List;
        _unread = data['unread'] ?? 0;
      });
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // تعليم إشعار واحد كمقروء عند الضغط عليه
  Future<void> _markRead(Map<String, dynamic> n) async {
    if (n['read'] == true) return;
    await widget.api.patch('/notifications/${n['_id']}/read', {});
    _load();
  }

  // Card 70: عند الضغط على الإشعار نعرض تفاصيله كاملةً (العنوان، النصّ، النوع،
  // الوقت، وأي بيانات مرتبطة مثل رقم الطلب أو حالته أو رمز التسليم)، ونعلّمه مقروءًا.
  Future<void> _openDetails(Map<String, dynamic> n) async {
    _markRead(n);
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _NotificationDetails(n: n, iconFor: _iconFor),
    );
  }

  // تعليم الكلّ كمقروء
  Future<void> _markAll() async {
    await widget.api.patch('/notifications/read-all', {});
    _load();
  }

  // أيقونة حسب نوع الإشعار
  IconData _iconFor(String type) => switch (type) {
        'ORDER_ASSIGNED' => Icons.assignment,
        'ORDER_STATUS' => Icons.local_shipping,
        'ORDER_CANCELLED' => Icons.cancel,
        _ => Icons.notifications,
      };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_unread > 0 ? 'الإشعارات ($_unread)' : 'الإشعارات'),
        actions: [
          if (_unread > 0)
            TextButton(onPressed: _markAll, child: const Text('تعليم الكلّ', style: TextStyle(color: Colors.white))),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _items.isEmpty
              ? const Center(child: Text('لا توجد إشعارات'))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.separated(
                    itemCount: _items.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (_, i) {
                      final n = _items[i] as Map<String, dynamic>;
                      final unread = n['read'] != true;
                      return Container(
                        color: unread ? Colors.blue.shade50 : null,
                        child: ListTile(
                          leading: Icon(_iconFor(n['type'] ?? ''),
                              color: unread ? Colors.blue : Colors.grey),
                          title: Text(n['title'] ?? '',
                              style: TextStyle(fontWeight: unread ? FontWeight.bold : FontWeight.normal)),
                          subtitle: Text(n['body'] ?? ''),
                          trailing: unread
                              ? const Icon(Icons.circle, size: 10, color: Colors.blue)
                              : const Icon(Icons.chevron_left, size: 18, color: Colors.grey),
                          onTap: () => _openDetails(n),
                        ),
                      );
                    },
                  ),
                ),
    );
  }
}

// Card 70: بطاقة تفاصيل الإشعار — تُفتح عند الضغط على أي إشعار وتعرض معلوماته كاملةً.
class _NotificationDetails extends StatelessWidget {
  final Map<String, dynamic> n;
  final IconData Function(String) iconFor;
  const _NotificationDetails({required this.n, required this.iconFor});

  // تسمية عربية لنوع الإشعار
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

  // تسمية عربية لحالة الطلب المرفقة في بيانات الإشعار
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

  // تنسيق التاريخ والوقت بصيغة عربية بسيطة (YYYY/MM/DD - HH:MM) بالتوقيت المحلّي
  String _formatDate(String? iso) {
    if (iso == null || iso.isEmpty) return '';
    final d = DateTime.tryParse(iso)?.toLocal();
    if (d == null) return '';
    String two(int v) => v.toString().padLeft(2, '0');
    return '${d.year}/${two(d.month)}/${two(d.day)} — ${two(d.hour)}:${two(d.minute)}';
  }

  @override
  Widget build(BuildContext context) {
    final data = (n['data'] is Map) ? Map<String, dynamic>.from(n['data'] as Map) : <String, dynamic>{};
    final orderId = data['orderId']?.toString();
    final status = data['status']?.toString();
    final code = data['code']?.toString();
    final when = _formatDate(n['createdAt']?.toString());

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 4,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                backgroundColor: Colors.blue.shade50,
                child: Icon(iconFor(n['type'] ?? ''), color: Colors.blue),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(n['title'] ?? '',
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.blue.shade50,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(_typeLabel,
                    style: TextStyle(color: Colors.blue.shade700, fontSize: 12, fontWeight: FontWeight.w600)),
              ),
              if (when.isNotEmpty)
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.schedule, size: 14, color: Colors.grey),
                    const SizedBox(width: 4),
                    Text(when, style: const TextStyle(color: Colors.grey, fontSize: 12)),
                  ],
                ),
            ],
          ),
          const Divider(height: 24),
          // النصّ الكامل للإشعار (قابل للتحديد والنسخ)
          SelectableText(
            (n['body'] as String?)?.isNotEmpty == true ? n['body'] : 'لا يوجد تفاصيل إضافية',
            style: const TextStyle(fontSize: 15, height: 1.5),
          ),
          if (orderId != null || status != null || code != null) ...[
            const SizedBox(height: 16),
            if (code != null) _detailRow(Icons.key, 'رمز التسليم', code),
            if (status != null) _detailRow(Icons.local_shipping, 'حالة الطلب', _statusLabel(status)),
            if (orderId != null)
              _detailRow(Icons.receipt_long, 'رقم الطلب',
                  '#${orderId.length > 6 ? orderId.substring(orderId.length - 6) : orderId}'),
          ],
        ],
      ),
    );
  }

  Widget _detailRow(IconData icon, String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            Icon(icon, size: 18, color: Colors.grey),
            const SizedBox(width: 8),
            Text('$label: ', style: const TextStyle(color: Colors.grey, fontSize: 13)),
            Expanded(
              child: Text(value,
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
            ),
          ],
        ),
      );
}
