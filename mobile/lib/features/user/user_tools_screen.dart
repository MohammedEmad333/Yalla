import 'package:flutter/material.dart';

import '../../core/data/gaza_neighborhoods.dart';
import '../../core/network/api_client.dart';
import '../restaurants/data/restaurant_repository.dart';
import '../restaurants/presentation/restaurant_menu_screen.dart';

class UserToolsScreen extends StatefulWidget {
  final ApiClient api;
  const UserToolsScreen({super.key, required this.api});

  @override
  State<UserToolsScreen> createState() => _UserToolsScreenState();
}

class _UserToolsScreenState extends State<UserToolsScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 4, vsync: this);

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: const Text('المحفوظات والعروض'),
          bottom: TabBar(
            controller: _tabs,
            isScrollable: false,
            labelPadding: EdgeInsets.zero,
            indicatorSize: TabBarIndicatorSize.tab,
            tabs: const [
              Tab(height: 62, text: 'العناوين', icon: Icon(Icons.location_on_outlined, size: 22)),
              Tab(height: 62, text: 'المفضلة', icon: Icon(Icons.favorite_outline, size: 22)),
              Tab(height: 62, text: 'إعادة الطلب', icon: Icon(Icons.replay_outlined, size: 22)),
              Tab(height: 62, text: 'الكوبونات', icon: Icon(Icons.local_offer_outlined, size: 22)),
            ],
          ),
        ),
        body: TabBarView(
          controller: _tabs,
          children: [
            _AddressesTab(api: widget.api),
            _FavoritesTab(api: widget.api),
            _ReorderTab(api: widget.api),
            _CouponsTab(api: widget.api),
          ],
        ),
      );
}

class _AddressesTab extends StatefulWidget {
  final ApiClient api;
  const _AddressesTab({required this.api});
  @override
  State<_AddressesTab> createState() => _AddressesTabState();
}

class _AddressesTabState extends State<_AddressesTab> {
  List<dynamic> _items = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await widget.api.get('/features/addresses');
      if (mounted) setState(() => _items = data as List);
    } catch (e) {
      if (mounted) _snack(e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _add() async {
    String? city;
    String? neighborhood;
    final label = TextEditingController(text: 'المنزل');
    final details = TextEditingController();
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (ctx) => StatefulBuilder(builder: (ctx, setLocal) {
        return AlertDialog(
          title: const Text('حفظ عنوان'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              TextField(controller: label, decoration: const InputDecoration(labelText: 'اسم العنوان')),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                value: city,
                decoration: const InputDecoration(labelText: 'المدينة'),
                items: gazaCities.map((e) => DropdownMenuItem(value: e, child: Text(e))).toList(),
                onChanged: (v) => setLocal(() { city = v; neighborhood = null; }),
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                value: neighborhood,
                decoration: const InputDecoration(labelText: 'الحي'),
                items: neighborhoodsOf(city).map((e) => DropdownMenuItem(value: e, child: Text(e))).toList(),
                onChanged: city == null ? null : (v) => setLocal(() => neighborhood = v),
              ),
              const SizedBox(height: 10),
              TextField(controller: details, decoration: const InputDecoration(labelText: 'تفاصيل العنوان')),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('إلغاء')),
            FilledButton(onPressed: () {
              if (city == null || neighborhood == null) return;
              final coords = coordsOf(city, neighborhood);
              if (coords == null) return;
              Navigator.pop(ctx, {
                'label': label.text.trim().isEmpty ? 'عنوان' : label.text.trim(),
                'address': [city, neighborhood, details.text.trim()].where((e) => e != null && e.toString().isNotEmpty).join(' - '),
                'location': {'type': 'Point', 'coordinates': coords},
              });
            }, child: const Text('حفظ')),
          ],
        );
      }),
    );
    if (result == null) return;
    try {
      await widget.api.post('/features/addresses', result);
      await _load();
    } on ApiException catch (e) { _snack(e.message); }
  }

  Future<void> _delete(String id) async {
    await widget.api.delete('/features/addresses/$id');
    await _load();
  }

  void _snack(String s) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s)));

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          FilledButton.icon(onPressed: _add, icon: const Icon(Icons.add_location_alt_outlined), label: const Text('إضافة عنوان محفوظ')),
          const SizedBox(height: 12),
          if (_items.isEmpty) const Padding(padding: EdgeInsets.all(24), child: Center(child: Text('لا توجد عناوين محفوظة'))),
          ..._items.map((raw) {
            final a = Map<String, dynamic>.from(raw as Map);
            return Card(child: ListTile(
              leading: const Icon(Icons.place_outlined),
              title: Text((a['label'] ?? 'عنوان').toString()),
              subtitle: Text((a['address'] ?? '').toString()),
              trailing: IconButton(icon: const Icon(Icons.delete_outline), onPressed: () => _delete((a['_id'] ?? a['id']).toString())),
            ));
          }),
        ],
      ),
    );
  }
}

class _FavoritesTab extends StatefulWidget {
  final ApiClient api;
  const _FavoritesTab({required this.api});
  @override
  State<_FavoritesTab> createState() => _FavoritesTabState();
}

class _FavoritesTabState extends State<_FavoritesTab> {
  List<dynamic> _items = [];
  bool _loading = true;
  @override
  void initState() { super.initState(); _load(); }
  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await widget.api.get('/features/favorites');
      if (mounted) setState(() => _items = data as List);
    } finally { if (mounted) setState(() => _loading = false); }
  }
  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_items.isEmpty) return const Center(child: Text('لا توجد متاجر مفضلة بعد'));
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _items.length,
        itemBuilder: (_, i) {
          final row = Map<String, dynamic>.from(_items[i] as Map);
          final raw = row['restaurant'];
          if (raw is! Map) return const SizedBox.shrink();
          final restaurant = Restaurant.fromJson(Map<String, dynamic>.from(raw));
          return Card(
            child: ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              leading: CircleAvatar(
                backgroundColor: Theme.of(context).colorScheme.primaryContainer,
                child: Icon(
                  Icons.storefront_outlined,
                  color: Theme.of(context).colorScheme.primary,
                ),
              ),
              title: Text(
                restaurant.name,
                style: const TextStyle(fontWeight: FontWeight.w900),
              ),
              subtitle: Text(
                restaurant.address,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => RestaurantMenuScreen(
                    api: widget.api,
                    restaurant: restaurant,
                  ),
                ),
              ),
              trailing: IconButton(
                icon: const Icon(Icons.favorite_rounded, color: Colors.redAccent),
                tooltip: 'إزالة من المفضلة',
                onPressed: () async {
                  await widget.api.post('/features/favorites/${restaurant.id}/toggle', {});
                  await _load();
                },
              ),
            ),
          );
        },
      ),
    );
  }
}

class _ReorderTab extends StatefulWidget {
  final ApiClient api;
  const _ReorderTab({required this.api});
  @override
  State<_ReorderTab> createState() => _ReorderTabState();
}

class _ReorderTabState extends State<_ReorderTab> {
  List<dynamic> _orders = [];
  bool _loading = true;
  String? _busyId;
  @override
  void initState() { super.initState(); _load(); }
  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await widget.api.get('/orders/mine');
      final all = data as List;
      if (mounted) setState(() => _orders = all.where((o) => o is Map && o['store']?['restaurant'] != null).toList());
    } finally { if (mounted) setState(() => _loading = false); }
  }
  Future<void> _reorder(Map<String, dynamic> order) async {
    final id = order['_id'].toString();
    setState(() => _busyId = id);
    try {
      await widget.api.post('/commerce/reorder/$id', {});
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم إنشاء الطلب مرة أخرى')));
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally { if (mounted) setState(() => _busyId = null); }
  }
  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_orders.isEmpty) return const Center(child: Text('لا توجد طلبات متاجر سابقة'));
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _orders.length,
      itemBuilder: (_, i) {
        final o = Map<String, dynamic>.from(_orders[i] as Map);
        final store = o['store'] as Map?;
        final items = (store?['items'] as List?) ?? const [];
        final id = o['_id'].toString();
        return Card(child: ListTile(
          leading: const Icon(Icons.restaurant_menu),
          title: Text((store?['name'] ?? 'طلب متجر').toString()),
          subtitle: Text('${items.length} أصناف · ${(store?['itemsTotal'] ?? 0)} ₪'),
          trailing: FilledButton.icon(
            onPressed: _busyId == null ? () => _reorder(o) : null,
            icon: _busyId == id ? const SizedBox.square(dimension: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.replay),
            label: const Text('اطلب مجددًا'),
          ),
        ));
      },
    );
  }
}

class _CouponsTab extends StatefulWidget {
  final ApiClient api;
  const _CouponsTab({required this.api});
  @override
  State<_CouponsTab> createState() => _CouponsTabState();
}

class _CouponsTabState extends State<_CouponsTab> {
  List<dynamic> _items = [];
  bool _loading = true;
  @override
  void initState() { super.initState(); _load(); }
  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await widget.api.get('/features/coupons');
      if (mounted) setState(() => _items = data as List);
    } finally { if (mounted) setState(() => _loading = false); }
  }
  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_items.isEmpty) return const Center(child: Text('لا توجد كوبونات متاحة حاليًا'));
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _items.length,
        itemBuilder: (_, i) {
          final c = Map<String, dynamic>.from(_items[i] as Map);
          final type = c['type'] == 'fixed' ? '${c['value']} ₪' : '${c['value']}%';
          return Card(child: ListTile(
            leading: const CircleAvatar(child: Icon(Icons.local_offer_outlined)),
            title: Text((c['title'] ?? c['code']).toString()),
            subtitle: Text('الكود: ${c['code']} · خصم $type${(c['minOrder'] ?? 0) > 0 ? ' · حد أدنى ${c['minOrder']} ₪' : ''}'),
          ));
        },
      ),
    );
  }
}
