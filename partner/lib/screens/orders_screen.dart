import 'dart:async';

import 'package:flutter/material.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../core/api_client.dart';
import '../core/app_config.dart';

class OrdersScreen extends StatefulWidget {
  final ApiClient api;
  const OrdersScreen({super.key, required this.api});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  List<dynamic> _orders = [];
  bool _loading = true;
  String _error = '';
  Timer? _timer;
  io.Socket? _socket;

  @override
  void initState() {
    super.initState();
    _load();
    _connectSocket();
    _timer = Timer.periodic(const Duration(seconds: 15), (_) => _load(silent: true));
  }

  Future<void> _connectSocket() async {
    final token = await widget.api.tokens.read();
    if (!mounted || token == null) return;
    final socket = io.io(
      AppConfig.origin,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .setAuth({'token': token})
          .enableReconnection()
          .build(),
    );
    socket.on('order:created', (_) => _load(silent: true));
    socket.on('order:status_updated', (_) => _load(silent: true));
    socket.connect();
    _socket = socket;
  }

  @override
  void dispose() {
    _timer?.cancel();
    _socket?.dispose();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent && mounted) setState(() => _loading = true);
    try {
      final data = await widget.api.get('/merchant/orders');
      if (mounted) setState(() { _orders = data as List<dynamic>; _error = ''; });
    } catch (error) {
      if (mounted && !silent) setState(() => _error = error.toString());
    } finally {
      if (mounted && !silent) setState(() => _loading = false);
    }
  }

  Future<void> _advance(Map<String, dynamic> order, String next) async {
    try {
      await widget.api.patch('/merchant/orders/${order['_id']}/status', {'status': next});
      await _load(silent: true);
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    return RefreshIndicator(
      onRefresh: _load,
      child: _orders.isEmpty
          ? ListView(children: const [SizedBox(height: 160), Icon(Icons.receipt_long_rounded, size: 58), SizedBox(height: 12), Center(child: Text('لا توجد طلبات بعد'))])
          : ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 110),
              itemCount: _orders.length + (_error.isEmpty ? 0 : 1),
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                if (_error.isNotEmpty && index == 0) {
                  return Card(color: Theme.of(context).colorScheme.errorContainer, child: Padding(padding: const EdgeInsets.all(16), child: Text(_error)));
                }
                final offset = _error.isEmpty ? index : index - 1;
                return _OrderCard(
                  order: Map<String, dynamic>.from(_orders[offset] as Map),
                  onAdvance: _advance,
                );
              },
            ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  final Map<String, dynamic> order;
  final Future<void> Function(Map<String, dynamic>, String) onAdvance;
  const _OrderCard({required this.order, required this.onAdvance});

  static const labels = {
    'new': 'طلب جديد',
    'accepted': 'تم القبول',
    'preparing': 'قيد التحضير',
    'ready': 'جاهز للاستلام',
  };
  static const next = {
    'new': ('accepted', 'قبول الطلب'),
    'accepted': ('preparing', 'بدء التحضير'),
    'preparing': ('ready', 'جاهز للاستلام'),
  };

  @override
  Widget build(BuildContext context) {
    final store = Map<String, dynamic>.from((order['store'] as Map?) ?? {});
    final user = Map<String, dynamic>.from((order['user'] as Map?) ?? {});
    final items = (store['items'] as List?) ?? const [];
    final status = store['merchantStatus']?.toString() ?? 'new';
    final action = next[status];
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(color: _statusColor(context, status), borderRadius: BorderRadius.circular(20)),
                child: Text(labels[status] ?? status, style: const TextStyle(fontWeight: FontWeight.w700)),
              ),
              const Spacer(),
              Text('#${order['_id'].toString().substring(order['_id'].toString().length - 6)}', textDirection: TextDirection.ltr),
            ]),
            const SizedBox(height: 14),
            Text('${user['name'] ?? 'زبون'} ${user['lastName'] ?? ''}', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            if (user['phone'] != null) Text(user['phone'].toString(), textDirection: TextDirection.ltr, textAlign: TextAlign.right),
            const Divider(height: 26),
            ...items.map((raw) {
              final item = Map<String, dynamic>.from(raw as Map);
              return Padding(
                padding: const EdgeInsets.only(bottom: 7),
                child: Row(children: [
                  Text('${item['qty']}×', style: const TextStyle(fontWeight: FontWeight.w800)),
                  const SizedBox(width: 8),
                  Expanded(child: Text(item['name']?.toString() ?? 'صنف')),
                  Text('${item['price']} ₪'),
                ]),
              );
            }),
            if ((store['note']?.toString() ?? '').isNotEmpty) ...[
              const SizedBox(height: 6),
              Text('ملاحظة: ${store['note']}', style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const Divider(height: 26),
            Row(children: [
              const Text('قيمة الأصناف', style: TextStyle(fontWeight: FontWeight.w700)),
              const Spacer(),
              Text('${store['itemsTotal'] ?? 0} ₪', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
            ]),
            const SizedBox(height: 12),
            if (action != null)
              FilledButton(
                onPressed: () => onAdvance(order, action.$1),
                child: Padding(padding: const EdgeInsets.symmetric(vertical: 10), child: Text(action.$2)),
              )
            else
              const OutlinedButton(onPressed: null, child: Text('بانتظار الكابتن')),
          ],
        ),
      ),
    );
  }

  Color _statusColor(BuildContext context, String status) => switch (status) {
        'new' => Theme.of(context).colorScheme.primaryContainer,
        'ready' => const Color(0xFFD9F7E8),
        _ => const Color(0xFFE8EEF8),
      };
}
