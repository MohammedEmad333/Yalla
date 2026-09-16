import 'package:flutter/material.dart';

import '../core/api_client.dart';

class InventoryScreen extends StatefulWidget {
  final ApiClient api;
  const InventoryScreen({super.key, required this.api});

  @override
  State<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends State<InventoryScreen> {
  Map<String, dynamic> _summary = {};
  List<dynamic> _items = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final result = await Future.wait<dynamic>([
        widget.api.get('/merchant/inventory'),
        widget.api.get('/merchant/menu'),
      ]);
      if (mounted) setState(() {
        _summary = Map<String, dynamic>.from(result[0] as Map);
        _items = result[1] as List;
      });
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _adjust(Map<String, dynamic> item, int delta) async {
    if (item['trackInventory'] != true) {
      await _setInventory(item);
      return;
    }
    try {
      await widget.api.patch('/merchant/inventory/${item['_id']}', {'delta': delta});
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _setInventory(Map<String, dynamic> item) async {
    final qty = TextEditingController(text: '${item['inventoryQty'] ?? 0}');
    final threshold = TextEditingController(text: '${item['lowStockThreshold'] ?? 3}');
    var enabled = item['trackInventory'] == true;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, local) => AlertDialog(
          title: Text(item['name']?.toString() ?? 'المخزون'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            SwitchListTile.adaptive(contentPadding: EdgeInsets.zero, value: enabled, onChanged: (v) => local(() => enabled = v), title: const Text('تتبع المخزون')),
            TextField(controller: qty, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'الكمية الحالية')),
            const SizedBox(height: 8),
            TextField(controller: threshold, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'حد تنبيه المخزون المنخفض')),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('حفظ')),
          ],
        ),
      ),
    );
    if (ok != true) return;
    try {
      final nextQty = int.tryParse(qty.text.trim()) ?? 0;
      await widget.api.patch('/merchant/menu/${item['_id']}', {
        'trackInventory': enabled,
        'inventoryQty': nextQty,
        'lowStockThreshold': int.tryParse(threshold.text.trim()) ?? 3,
        if (enabled) 'available': nextQty > 0,
      });
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('المخزون')),
    body: RefreshIndicator(
      onRefresh: _load,
      child: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Row(children: [
                  Expanded(child: _stat('متتبع', '${_summary['tracked'] ?? 0}', Icons.inventory_2_outlined)),
                  const SizedBox(width: 8),
                  Expanded(child: _stat('منخفض', '${_summary['lowStock'] ?? 0}', Icons.warning_amber_rounded)),
                  const SizedBox(width: 8),
                  Expanded(child: _stat('نافد', '${_summary['outOfStock'] ?? 0}', Icons.remove_shopping_cart_outlined)),
                ]),
                const SizedBox(height: 16),
                const Text('كل المنتجات', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                const SizedBox(height: 8),
                if (_items.isEmpty)
                  const Card(child: Padding(padding: EdgeInsets.all(24), child: Text('لا توجد منتجات بعد.')))
                else
                  ..._items.map((raw) {
                    final item = Map<String, dynamic>.from(raw as Map);
                    final tracked = item['trackInventory'] == true;
                    final qty = ((item['inventoryQty'] as num?) ?? 0).toInt();
                    final low = ((item['lowStockThreshold'] as num?) ?? 3).toInt();
                    final label = !tracked ? 'تتبع المخزون غير مفعّل' : qty == 0 ? 'نافد من المخزون' : qty <= low ? 'مخزون منخفض · الحد $low' : 'المخزون جيد · الحد $low';
                    return Card(
                      child: ListTile(
                        onTap: () => _setInventory(item),
                        leading: CircleAvatar(child: tracked ? Text('$qty') : const Icon(Icons.all_inclusive)),
                        title: Text(item['name']?.toString() ?? ''),
                        subtitle: Text(label),
                        trailing: tracked
                            ? Wrap(spacing: 0, children: [
                                IconButton(onPressed: () => _adjust(item, -1), icon: const Icon(Icons.remove_circle_outline)),
                                IconButton(onPressed: () => _adjust(item, 1), icon: const Icon(Icons.add_circle_outline)),
                              ])
                            : const Icon(Icons.tune_outlined),
                      ),
                    );
                  }),
              ],
            ),
    ),
  );

  Widget _stat(String title, String value, IconData icon) => Card(
    child: Padding(
      padding: const EdgeInsets.all(14),
      child: Column(children: [Icon(icon), const SizedBox(height: 6), Text(value, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)), Text(title, style: const TextStyle(fontSize: 12))]),
    ),
  );
}
