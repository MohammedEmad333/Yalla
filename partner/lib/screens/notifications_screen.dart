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
  void initState() { super.initState(); _load(); }

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
      title: const Text('الإشعارات'),
      actions: [TextButton(onPressed: _items.isEmpty ? null : _readAll, child: const Text('قراءة الكل'))],
    ),
    body: _loading
        ? const Center(child: CircularProgressIndicator())
        : RefreshIndicator(
            onRefresh: _load,
            child: _items.isEmpty
                ? ListView(children: [
                    const SizedBox(height: 170),
                    const Icon(Icons.notifications_none_rounded, size: 64),
                    const SizedBox(height: 12),
                    Center(child: Text(_error.isEmpty ? 'لا توجد إشعارات بعد' : _error)),
                  ])
                : ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: _items.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (_, i) {
                      final n = Map<String, dynamic>.from(_items[i] as Map);
                      return Card(
                        color: n['read'] == true ? null : Theme.of(context).colorScheme.primaryContainer,
                        child: ListTile(
                          leading: const CircleAvatar(child: Icon(Icons.notifications_active_outlined)),
                          title: Text(n['title']?.toString() ?? '', style: const TextStyle(fontWeight: FontWeight.w800)),
                          subtitle: Text(n['body']?.toString() ?? ''),
                          onTap: () async {
                            if (n['read'] != true) {
                              await widget.api.patch('/notifications/${n['_id']}/read', {});
                              await _load();
                            }
                          },
                        ),
                      );
                    },
                  ),
          ),
  );
}
