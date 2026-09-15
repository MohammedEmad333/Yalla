import 'package:flutter/material.dart';

import '../core/api_client.dart';

class PartnerNotificationsScreen extends StatefulWidget {
  final ApiClient api;
  const PartnerNotificationsScreen({super.key, required this.api});

  @override
  State<PartnerNotificationsScreen> createState() => _PartnerNotificationsScreenState();
}

class _PartnerNotificationsScreenState extends State<PartnerNotificationsScreen> {
  List<dynamic> _items = [];
  bool _loading = true;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await widget.api.get('/notifications');
      if (mounted) setState(() { _items = (data['items'] as List?) ?? []; _error = ''; });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _readAll() async {
    await widget.api.patch('/notifications/read-all', {});
    await _load();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          toolbarHeight: 76,
          title: const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('الإشعارات', style: TextStyle(fontWeight: FontWeight.w900)),
              Text('آخر التحديثات والتنبيهات لمتجرك', style: TextStyle(fontSize: 11.5, color: Color(0xFF7A8595))),
            ],
          ),
          actions: [
            Padding(
              padding: const EdgeInsetsDirectional.only(end: 10),
              child: TextButton.icon(
                onPressed: _items.isEmpty ? null : _readAll,
                icon: const Icon(Icons.done_all_rounded, size: 18),
                label: const Text('قراءة الكل'),
              ),
            ),
          ],
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
                  children: [
                    if (_items.isEmpty)
                      Container(
                        padding: const EdgeInsets.symmetric(vertical: 64, horizontal: 20),
                        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(24)),
                        child: Column(
                          children: [
                            Container(
                              width: 72,
                              height: 72,
                              decoration: BoxDecoration(color: const Color(0xFFFFF0E2), borderRadius: BorderRadius.circular(22)),
                              child: const Icon(Icons.notifications_none_rounded, size: 36, color: Color(0xFFFF7A00)),
                            ),
                            const SizedBox(height: 14),
                            Text(_error.isEmpty ? 'لا توجد إشعارات بعد' : 'تعذر تحميل الإشعارات', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
                            const SizedBox(height: 5),
                            Text(
                              _error.isEmpty ? 'ستظهر هنا تنبيهات الطلبات والتحديثات المهمة.' : _error,
                              textAlign: TextAlign.center,
                              style: const TextStyle(color: Color(0xFF7A8595), height: 1.5),
                            ),
                          ],
                        ),
                      )
                    else
                      ..._items.map((raw) {
                        final n = Map<String, dynamic>.from(raw as Map);
                        final unread = n['read'] != true;
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: Card(
                            color: unread ? const Color(0xFFFFFBF6) : Colors.white,
                            child: InkWell(
                              borderRadius: BorderRadius.circular(24),
                              onTap: () async {
                                if (unread) {
                                  await widget.api.patch('/notifications/${n['_id']}/read', {});
                                  await _load();
                                }
                              },
                              child: Padding(
                                padding: const EdgeInsets.all(14),
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Container(
                                      width: 46,
                                      height: 46,
                                      decoration: BoxDecoration(
                                        color: unread ? const Color(0xFFFFE8D2) : const Color(0xFFF0F3F7),
                                        borderRadius: BorderRadius.circular(15),
                                      ),
                                      child: Icon(
                                        unread ? Icons.notifications_active_rounded : Icons.notifications_none_rounded,
                                        color: unread ? const Color(0xFFFF7A00) : const Color(0xFF7A8595),
                                      ),
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Row(
                                            children: [
                                              Expanded(child: Text(n['title']?.toString() ?? '', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15))),
                                              if (unread)
                                                Container(width: 8, height: 8, decoration: const BoxDecoration(color: Color(0xFFFF7A00), shape: BoxShape.circle)),
                                            ],
                                          ),
                                          const SizedBox(height: 5),
                                          Text(n['body']?.toString() ?? '', style: const TextStyle(color: Color(0xFF657287), height: 1.45)),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        );
                      }),
                  ],
                ),
              ),
      );
}
