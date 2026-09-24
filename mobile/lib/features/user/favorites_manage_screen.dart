import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/web_safe_network_image.dart';
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
    if (missing.isEmpty) return serverRows;
    return await _serverFavorites();
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

      if (mounted) setState(() => _favorites = favorites);
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

  Widget _header() {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: AlignmentDirectional.topStart,
          end: AlignmentDirectional.bottomEnd,
          colors: dark
              ? const [Color(0xFF3A2618), Color(0xFF2B211B)]
              : const [Color(0xFFFFF8F1), Color(0xFFFFEAD6)],
        ),
        borderRadius: const BorderRadius.vertical(bottom: Radius.circular(26)),
        border: Border(
          bottom: BorderSide(
            color: YallaColors.primary.withValues(alpha: dark ? .22 : .12),
          ),
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 6, 12, 10),
          child: Row(
            textDirection: TextDirection.rtl,
            children: [
              IconButton(
                tooltip: 'رجوع',
                onPressed: () => Navigator.of(context).pop(),
                icon: const Icon(Icons.arrow_forward_rounded),
              ),
              Expanded(
                child: Column(
                  children: [
                    const Text(
                      'المفضلة',
                      style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${_favorites.length} متجر محفوظ',
                      style: TextStyle(
                        color: YallaColors.muted,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: YallaColors.primary.withValues(alpha: .12),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  Icons.favorite_rounded,
                  color: YallaColors.primary,
                  size: 21,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _ratingBadge(Restaurant r) {
    final hasRating = r.ratingCount > 0;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: hasRating
            ? Colors.black.withValues(alpha: .68)
            : YallaColors.primary.withValues(alpha: .94),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            hasRating ? Icons.star_rounded : Icons.auto_awesome_rounded,
            size: 14,
            color: hasRating ? const Color(0xFFFF9A3D) : Colors.white,
          ),
          const SizedBox(width: 4),
          Text(
            hasRating ? r.ratingAverage.toStringAsFixed(1) : 'جديد',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 11.5,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }

  Widget _metricPill(IconData icon, String label) => Container(
        constraints: const BoxConstraints(minHeight: 28),
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
        decoration: BoxDecoration(
          color: YallaColors.surfaceContainer,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: Theme.of(context).colorScheme.outlineVariant.withValues(alpha: .72),
            width: .9,
          ),
        ),
        child: Directionality(
          textDirection: TextDirection.rtl,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 12, color: YallaColors.primary),
              const SizedBox(width: 2),
              Text(
                label,
                maxLines: 1,
                softWrap: false,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 10.2, fontWeight: FontWeight.w800),
              ),
            ],
          ),
        ),
      );

  Widget _closedStoreOverlay(Restaurant r) {
    final label = r.opensAtLabel.isNotEmpty ? r.opensAtLabel : 'مغلق حاليًا';
    return ColoredBox(
      color: Colors.black.withValues(alpha: .36),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: .94),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: YallaColors.primary,
              fontSize: 11.5,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
      ),
    );
  }

  Widget _favoriteCard(Restaurant r) => Container(
        margin: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(
            color: Theme.of(context).colorScheme.outlineVariant.withValues(alpha: .82),
            width: 1.1,
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(
                alpha: Theme.of(context).brightness == Brightness.dark ? .12 : .045,
              ),
              blurRadius: 16,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: () async {
              await Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => RestaurantMenuScreen(api: widget.api, restaurant: r),
                ),
              );
              if (mounted) _load();
            },
            child: SizedBox(
              height: 116,
              child: Row(
                textDirection: TextDirection.rtl,
                children: [
                  AspectRatio(
                    aspectRatio: 5 / 3,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        r.fullImageUrl == null
                            ? ColoredBox(
                                color: YallaColors.surfaceContainer,
                                child: const Center(
                                  child: Icon(
                                    Icons.storefront_rounded,
                                    size: 38,
                                    color: Color(0xFF9AA0AA),
                                  ),
                                ),
                              )
                            : WebSafeNetworkImage(
                                url: r.fullImageUrl!,
                                fit: BoxFit.cover,
                                cacheWidth: 720,
                                placeholderBuilder: (_) => const SizedBox.shrink(),
                                errorBuilder: (_) => ColoredBox(
                                  color: YallaColors.surfaceContainer,
                                  child: const Center(
                                    child: Icon(
                                      Icons.storefront_rounded,
                                      size: 38,
                                      color: Color(0xFF9AA0AA),
                                    ),
                                  ),
                                ),
                              ),
                        if (!r.openNow) _closedStoreOverlay(r),
                        PositionedDirectional(
                          top: 8,
                          start: 8,
                          child: _ratingBadge(r),
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                      child: Directionality(
                        textDirection: TextDirection.ltr,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    r.name,
                                    textDirection: TextDirection.rtl,
                                    textAlign: TextAlign.left,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontSize: 16.5,
                                      fontWeight: FontWeight.w900,
                                    ),
                                  ),
                                ),
                                IconButton(
                                  tooltip: 'إزالة من المفضلة',
                                  visualDensity: VisualDensity.compact,
                                  padding: EdgeInsets.zero,
                                  constraints: const BoxConstraints.tightFor(
                                    width: 36,
                                    height: 36,
                                  ),
                                  onPressed: () => _remove(r),
                                  icon: const Icon(
                                    Icons.favorite_rounded,
                                    color: Color(0xFFE53935),
                                    size: 23,
                                  ),
                                ),
                              ],
                            ),
                            Text(
                              r.category,
                              textDirection: TextDirection.rtl,
                              textAlign: TextAlign.left,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: YallaColors.muted,
                                fontSize: 12.5,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const Spacer(),
                            Wrap(
                              spacing: 5,
                              runSpacing: 4,
                              children: [
                                if (r.prepMinutes > 0)
                                  _metricPill(
                                    Icons.schedule_rounded,
                                    '${r.prepMinutes} دقيقة',
                                  ),
                                if (r.minOrder > 0)
                                  _metricPill(
                                    Icons.shopping_bag_outlined,
                                    '${r.minOrder} ₪',
                                  ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );

  Widget _emptyState() => RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(24, 72, 24, 24),
          children: [
            Container(
              width: 82,
              height: 82,
              margin: const EdgeInsets.only(bottom: 18),
              decoration: BoxDecoration(
                color: YallaColors.primary.withValues(alpha: .10),
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.favorite_border_rounded,
                size: 40,
                color: YallaColors.primary,
              ),
            ),
            const Center(
              child: Text(
                'لا توجد متاجر مفضلة بعد',
                style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900),
              ),
            ),
            const SizedBox(height: 7),
            Center(
              child: Text(
                'اضغط على القلب داخل أي متجر، وسيظهر هنا مباشرة.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: YallaColors.muted,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      );

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Column(
          children: [
            _header(),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _favorites.isEmpty
                      ? _emptyState()
                      : RefreshIndicator(
                          onRefresh: _load,
                          child: ListView.builder(
                            cacheExtent: 650,
                            padding: const EdgeInsets.fromLTRB(14, 8, 14, 24),
                            itemCount: _favorites.length,
                            itemBuilder: (_, i) => _favoriteCard(_favorites[i]),
                          ),
                        ),
            ),
          ],
        ),
      );
}
