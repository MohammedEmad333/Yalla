// شاشة الإشعارات داخل التطبيق — مشتركة بين تطبيقَي المستخدم والكابتن.
// تعرض قائمة الإشعارات مع تمييز غير المقروء، وتعليم الكلّ/الواحد كمقروء.

import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';

class NotificationsScreen extends StatefulWidget {
  final ApiClient api;
  const NotificationsScreen({super.key, required this.api});

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
                              : null,
                          onTap: () => _markRead(n),
                        ),
                      );
                    },
                  ),
                ),
    );
  }
}
