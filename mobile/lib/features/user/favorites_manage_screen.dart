import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

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
  static const _favoritesStorageKey = 'favorite_restaurant_ids';
  static const _migrationKey = 'favorite_restaurant_ids_migrated_v1';

  final FlutterSecureStorage _secureStorage = const FlutterSecureStorage();
  List<Restaurant> _favorites = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Set<String> _favoriteIds(List<dynamic> rows) => rows
      .map((row) {
        final m = row as Map;
        final r = m['restaurant'];
        if (r is Map) return (r['_id'] ?? r['id'] ?? '').toString();
        return r?.toString() ?? '';
      })
      .where((id) => id.isNotEmpty)
      .toSet();

  List<Restaurant> _favoriteRestaurants(List<dynamic> rows) => rows
      .map((row) => (row as Map)['restaurant'])
      .whereType<Map>()
      .map((raw) => Restaurant.fromJson(Map<String, dynamic>.from(raw)))
      .where((restaurant) => restaurant.id.isNotEmpty)
      .toList();

  Future<List<dynamic>> _serverFavorites() async =>
      List<dynamic>.from(await widget.api.get('/features/favorites') as List);

  Future<List<dynamic>> _migrateLegacyFavoritesIfNeeded(List<dynamic> serverRows) async {
    final migrated = await _secureStorage.read(key: _migrationKey);
    if (migrated == '1') return serverRows;

    final raw = await _secureStorage.read(key: _favoritesStorageKey) ?? '';
    final localIds = raw.split('|').where((id) => id.isNotEmpty).toSet();
    final serverIds = _favoriteIds(serverRows);
    final missing = localIds.difference(serverIds);

    for (final id in missing) {
      try {
        await widget.api.post('/features/favorites/$id/toggle', {});
      } on ApiException {
        // متجر قديم/غير متاح: نتجاهله أثناء ترحيل المفضلة المحلية.
      }
    }

    await _secureStorage.write(key: _migrationKey, value: '1');
    return missing.isEmpty ? serverRows : _serverFavorites();
  }

  Future<void> _syncLocalCache(Set<String> ids) =>
      _secureStorage.write(key: _favoritesStorageKey, value: ids.join('|'));

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      var rows = await _serverFavorites();
      rows = await _migrateLegacyFavoritesIfNeeded(rows);
      final favorites = _favoriteRestaurants(rows);
      await _syncLocalCache(favorites.map((r) => r.id).toSet());

      if (mounted) {
        setState(() => _favorites = favorites);
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _remove(Restaurant restaurant) async {
    try {
      final raw = await widget.api.post('/features/favorites/${restaurant.id}/toggle', {});
      final favorite = (raw as Map)['favorite'] == true;
      if (!mounted) return;

      if (!favorite) {
        setState(() => _favorites.removeWhere((r) => r.id == restaurant.id));
        await _syncLocalCache(_favorites.map((r) => r.id).toSet());
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('تمت إزالة ${restaurant.name} من المفضلة')),
        );
      } else {
        await _load();
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('المفضلة')),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : _favorites.isEmpty
                ? RefreshIndicator(
                    onRefresh: _load,
                    child: ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: const [
                        SizedBox(height: 170),
                        Icon(Icons.favorite_border_rounded, size: 64, color: Colors.grey),
                        SizedBox(height: 16),
                        Center(
                          child: Text(
                            'لا توجد متاجر مفضلة بعد',
                            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                          ),
                        ),
                        SizedBox(height: 6),
                        Center(
                          child: Text(
                            'أضف المتاجر التي تحبها لتظهر هنا',
                            style: TextStyle(color: Colors.grey),
                          ),
                        ),
                      ],
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView.separated(
                      padding: const EdgeInsets.all(16),
                      itemCount: _favorites.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) {
                        final r = _favorites[i];
                        return Card(
                          child: ListTile(
                            leading: const CircleAvatar(child: Icon(Icons.storefront_outlined)),
                            title: Text(r.name),
                            subtitle: Text(
                              [r.category, r.address].where((e) => e.isNotEmpty).join(' · '),
                            ),
                            onTap: () async {
                              await Navigator.of(context).push(MaterialPageRoute(
                                builder: (_) => RestaurantMenuScreen(
                                  api: widget.api,
                                  restaurant: r,
                                ),
                              ));
                              if (mounted) _load();
                            },
                            trailing: IconButton(
                              tooltip: 'إزالة من المفضلة',
                              onPressed: () => _remove(r),
                              icon: const Icon(Icons.favorite_rounded, color: Colors.redAccent),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
      );
