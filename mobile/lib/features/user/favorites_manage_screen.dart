import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../restaurants/data/restaurant_repository.dart';
import '../restaurants/presentation/restaurant_menu_screen.dart';

class FavoritesManageScreen extends StatefulWidget {
  final ApiClient api;
  const FavoritesManageScreen({super.key, required this.api});

  @override
  State<FavoritesManageScreen> createState() => _FavoritesManageScreenState();
}

class _FavoritesManageScreenState extends State<FavoritesManageScreen> {
  late final RestaurantRepository _restaurants = RestaurantRepository(widget.api);
  List<Restaurant> _all = [];
  Set<String> _favoriteIds = {};
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        _restaurants.list(),
        widget.api.get('/features/favorites'),
      ]);
      final all = results[0] as List<Restaurant>;
      final favRaw = results[1] as List;
      final ids = favRaw.map((row) {
        final m = row as Map;
        final r = m['restaurant'];
        if (r is Map) return (r['_id'] ?? r['id'] ?? '').toString();
        return r?.toString() ?? '';
      }).where((id) => id.isNotEmpty).toSet();
      if (mounted) setState(() {
        _all = all;
        _favoriteIds = ids;
      });
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _toggle(Restaurant restaurant) async {
    try {
      final raw = await widget.api.post('/features/favorites/${restaurant.id}/toggle', {});
      final favorite = (raw as Map)['favorite'] == true;
      if (!mounted) return;
      setState(() {
        if (favorite) {
          _favoriteIds.add(restaurant.id);
        } else {
          _favoriteIds.remove(restaurant.id);
        }
      });
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('إدارة المفضلة')),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: _load,
                child: ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: _all.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (_, i) {
                    final r = _all[i];
                    final favorite = _favoriteIds.contains(r.id);
                    return Card(
                      child: ListTile(
                        leading: CircleAvatar(child: Icon(favorite ? Icons.favorite : Icons.storefront_outlined)),
                        title: Text(r.name),
                        subtitle: Text([r.category, r.address].where((e) => e.isNotEmpty).join(' · ')),
                        onTap: () => Navigator.of(context).push(MaterialPageRoute(
                          builder: (_) => RestaurantMenuScreen(api: widget.api, restaurant: r),
                        )),
                        trailing: IconButton(
                          tooltip: favorite ? 'إزالة من المفضلة' : 'إضافة للمفضلة',
                          onPressed: () => _toggle(r),
                          icon: Icon(favorite ? Icons.favorite : Icons.favorite_border, color: favorite ? Colors.redAccent : null),
                        ),
                      ),
                    );
                  },
                ),
              ),
      );
}
