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

  int _countFor(String status) => _orders.where((raw) {
        final order = Map<String, dynamic>.from(raw as Map);
        final store = Map<String, dynamic>.from((order['store'] as Map?) ?? {});
        return (store['merchantStatus']?.toString() ?? 'new') == status;
      }).length;

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    final newCount = _countFor('new');
    final preparingCount = _countFor('accepted') + _countFor('preparing');
    final readyCount = _countFor('ready');

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 116),
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: const Color(0xFF071D3A),
              borderRadius: BorderRadius.circular(26),
              boxShadow: const [
                BoxShadow(color: Color(0x18071D3A), blurRadius: 24, offset: Offset(0, 10)),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('إدارة الطلبات', style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w900)),
                          SizedBox(height: 4),
                          Text('تابع الطلب من لحظة وصوله حتى يصبح جاهزًا.', style: TextStyle(color: Color(0xFFB8C6D8), fontSize: 12.5)),
                        ],
                      ),
                    ),
                    Container(
                      width: 46,
                      height: 46,
                      decoration: BoxDecoration(
                        color: const Color(0x22FFFFFF),
                        borderRadius: BorderRadius.circular(15),
                      ),
                      child: const Icon(Icons.receipt_long_rounded, color: Color(0xFFFF9B3D)),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                Row(
                  children: [
                    Expanded(child: _SummaryTile(label: 'جديد', value: newCount, color: const Color(0xFFFFA64D))),
                    const SizedBox(width: 8),
                    Expanded(child: _SummaryTile(label: 'قيد التحضير', value: preparingCount, color: const Color(0xFF70B7FF))),
                    const SizedBox(width: 8),
                    Expanded(child: _SummaryTile(label: 'جاهز', value: readyCount, color: const Color(0xFF63D7A7))),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              const Expanded(
                child: Text('الطلبات الحالية', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20)),
                child: Text('${_orders.length} طلب', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
              ),
            ],
          ),
          if (_error.isNotEmpty) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: const Color(0xFFFFEFEF), borderRadius: BorderRadius.circular(16)),
              child: Row(
                children: [
                  const Icon(Icons.error_outline_rounded, color: Color(0xFFC23A3A)),
                  const SizedBox(width: 8),
                  Expanded(child: Text(_error, style: const TextStyle(color: Color(0xFFC23A3A)))),
                ],
              ),
            ),
          ],
          const SizedBox(height: 12),
          if (_orders.isEmpty)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 54, horizontal: 22),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(24)),
              child: const Column(
                children: [
                  Icon(Icons.inbox_outlined, size: 54, color: Color(0xFFB3BCC9)),
                  SizedBox(height: 12),
                  Text('لا توجد طلبات حاليًا', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                  SizedBox(height: 4),
                  Text('ستظهر الطلبات الجديدة هنا فور وصولها.', style: TextStyle(color: Color(0xFF7A8595))),
                ],
              ),
            )
          else
            ..._orders.map((raw) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _OrderCard(
                    order: Map<String, dynamic>.from(raw as Map),
                    onAdvance: _advance,
                  ),
                )),
        ],
      ),
    );
  }
}

class _SummaryTile extends StatelessWidget {
  final String label;
  final int value;
  final Color color;
  const _SummaryTile({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 10),
        decoration: BoxDecoration(
          color: const Color(0x14FFFFFF),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0x18FFFFFF)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('$value', style: TextStyle(color: color, fontSize: 21, fontWeight: FontWeight.w900)),
            const SizedBox(height: 2),
            Text(label, maxLines: 1, style: const TextStyle(color: Color(0xFFD9E2ED), fontSize: 11, fontWeight: FontWeight.w600)),
          ],
        ),
      );
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
    'preparing': ('ready', 'تحديد كجاهز'),
  };

  @override
  Widget build(BuildContext context) {
    final store = Map<String, dynamic>.from((order['store'] as Map?) ?? {});
    final user = Map<String, dynamic>.from((order['user'] as Map?) ?? {});
    final items = (store['items'] as List?) ?? const [];
    final status = store['merchantStatus']?.toString() ?? 'new';
    final action = next[status];
    final id = order['_id']?.toString() ?? '';
    final shortId = id.length > 6 ? id.substring(id.length - 6) : id;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                _StatusChip(status: status, label: labels[status] ?? status),
                const Spacer(),
                Text('#$shortId', textDirection: TextDirection.ltr, style: const TextStyle(color: Color(0xFF7A8595), fontWeight: FontWeight.w700)),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(color: const Color(0xFFF2F5F9), borderRadius: BorderRadius.circular(14)),
                  child: const Icon(Icons.person_outline_rounded, color: Color(0xFF071D3A)),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${user['name'] ?? 'زبون'} ${user['lastName'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
                      if (user['phone'] != null)
                        Text(user['phone'].toString(), textDirection: TextDirection.ltr, style: const TextStyle(color: Color(0xFF7A8595), fontSize: 12.5)),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: const Color(0xFFF7F8FA), borderRadius: BorderRadius.circular(16)),
              child: Column(
                children: items.map((raw) {
                  final item = Map<String, dynamic>.from(raw as Map);
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 5),
                    child: Row(
                      children: [
                        Container(
                          minWidth: 34,
                          alignment: Alignment.center,
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10)),
                          child: Text('${item['qty']}×', style: const TextStyle(fontWeight: FontWeight.w900, color: Color(0xFFFF7A00))),
                        ),
                        const SizedBox(width: 8),
                        Expanded(child: Text(item['name']?.toString() ?? 'صنف', style: const TextStyle(fontWeight: FontWeight.w700))),
                        Text('${item['price']} ₪', style: const TextStyle(fontWeight: FontWeight.w800)),
                      ],
                    ),
                  );
                }).toList(),
              ),
            ),
            if ((store['note']?.toString() ?? '').isNotEmpty) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: const Color(0xFFFFF5E8), borderRadius: BorderRadius.circular(14)),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.sticky_note_2_outlined, size: 20, color: Color(0xFFFF7A00)),
                    const SizedBox(width: 8),
                    Expanded(child: Text('ملاحظة: ${store['note']}', style: const TextStyle(color: Color(0xFF8A4A00)))),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 14),
            Row(
              children: [
                const Text('قيمة الأصناف', style: TextStyle(color: Color(0xFF657287), fontWeight: FontWeight.w700)),
                const Spacer(),
                Text('${store['itemsTotal'] ?? 0} ₪', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
              ],
            ),
            const SizedBox(height: 14),
            if (action != null)
              FilledButton.icon(
                onPressed: () => onAdvance(order, action.$1),
                icon: Icon(status == 'new' ? Icons.check_rounded : Icons.arrow_forward_rounded),
                label: Text(action.$2),
              )
            else
              Container(
                padding: const EdgeInsets.symmetric(vertical: 14),
                decoration: BoxDecoration(color: const Color(0xFFEAF8F1), borderRadius: BorderRadius.circular(16)),
                child: const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.delivery_dining_rounded, color: Color(0xFF218A5A)),
                    SizedBox(width: 8),
                    Text('جاهز — بانتظار الكابتن', style: TextStyle(color: Color(0xFF218A5A), fontWeight: FontWeight.w800)),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String status;
  final String label;
  const _StatusChip({required this.status, required this.label});

  @override
  Widget build(BuildContext context) {
    final color = switch (status) {
      'new' => const Color(0xFFFF7A00),
      'accepted' => const Color(0xFF3578C9),
      'preparing' => const Color(0xFF8B5FBF),
      'ready' => const Color(0xFF218A5A),
      _ => const Color(0xFF657287),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(color: color.withValues(alpha: .12), borderRadius: BorderRadius.circular(20)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 7, height: 7, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
          const SizedBox(width: 6),
          Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 12)),
        ],
      ),
    );
  }
}
