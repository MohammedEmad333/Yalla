import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/web_safe_network_image.dart';
import '../../user/favorites_manage_screen.dart';
import '../data/restaurant_repository.dart';
import 'restaurant_menu_screen.dart';

class RestaurantsScreen extends StatefulWidget {
  final ApiClient api;
  const RestaurantsScreen({super.key, required this.api});

  @override
  State<RestaurantsScreen> createState() => _RestaurantsScreenState();
}

class _RestaurantsScreenState extends State<RestaurantsScreen> {
  late final RestaurantRepository _repo = RestaurantRepository(widget.api);
  final _search = TextEditingController();
  final _searchFocus = FocusNode();
  final _bannerController = PageController(viewportFraction: .94);
  Timer? _debounce;
  Timer? _bannerTimer;
  final ValueNotifier<int> _bannerIndex = ValueNotifier<int>(0);
  int _serial = 0;
  List<Restaurant> _restaurants = [];
  List<String> _categories = [];
  List<dynamic> _banners = [];
  String _category = 'الكل';
  bool _loading = true;
  bool _searching = false;
  bool _showSearch = false;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _load(initial: true);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _bannerTimer?.cancel();
    _bannerController.dispose();
    _bannerIndex.dispose();
    _searchFocus.dispose();
    _search.dispose();
    super.dispose();
  }

  void _restartBannerTimer() {
    _bannerTimer?.cancel();
    if (_banners.length <= 1) return;
    _bannerTimer = Timer.periodic(const Duration(seconds: 4), (_) {
      if (!mounted || !_bannerController.hasClients || _banners.length <= 1) return;
      final next = (_bannerIndex.value + 1) % _banners.length;
      _bannerController.animateToPage(
        next,
        duration: const Duration(milliseconds: 520),
        curve: Curves.easeInOutCubic,
      );
    });
  }

  Future<void> _load({bool initial = false}) async {
    final requestId = ++_serial;
    final q = _search.text.trim();
    setState(() {
      _loading = _restaurants.isEmpty;
      _searching = _restaurants.isNotEmpty;
      _error = '';
    });
    try {
      List<String>? nextCategories;
      List<dynamic>? nextBanners;
      if (initial || _categories.isEmpty || _banners.isEmpty) {
        final result = await Future.wait<dynamic>([
          _repo.categories(),
          widget.api.get('/expansion/banners'),
        ]);
        nextCategories = (result[0] as List).map((e) => e.toString()).toList();
        nextBanners = result[1] as List;
      }

      List<Restaurant> list;
      if (q.isNotEmpty) {
        final params = <String, String>{'q': q, if (_category != 'الكل') 'category': _category};
        final query = params.entries.map((e) => '${e.key}=${Uri.encodeQueryComponent(e.value)}').join('&');
        final data = await widget.api.get('/expansion/search?$query');
        list = (data as List).map((e) => Restaurant.fromJson(Map<String, dynamic>.from(e as Map))).toList();
      } else {
        list = await _repo.list(category: _category);
      }
      if (!mounted || requestId != _serial) return;
      list.sort((a, b) {
        if (a.openNow != b.openNow) return a.openNow ? -1 : 1;
        final byOrders = b.orderCount.compareTo(a.orderCount);
        if (byOrders != 0) return byOrders;
        return a.name.compareTo(b.name);
      });
      setState(() {
        if (nextCategories != null) _categories = nextCategories;
        if (nextBanners != null) _banners = nextBanners;
        _restaurants = list;
      });
      _precacheStoreImages(list);
      if (nextBanners != null) {
        _bannerIndex.value = 0;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted) return;
          if (_bannerController.hasClients && _banners.isNotEmpty) {
            _bannerController.jumpToPage(0);
          }
          _restartBannerTimer();
        });
      }
    } on ApiException catch (e) {
      if (mounted && requestId == _serial) setState(() => _error = e.message);
    } catch (_) {
      if (mounted && requestId == _serial) setState(() => _error = 'تعذّر تحميل المتاجر');
    } finally {
      if (mounted && requestId == _serial) setState(() { _loading = false; _searching = false; });
    }
  }

  void _precacheStoreImages(List<Restaurant> restaurants) {
    if (kIsWeb) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      for (final restaurant in restaurants.take(6)) {
        final url = restaurant.fullImageUrl;
        if (url == null || url.isEmpty) continue;
        precacheImage(CachedNetworkImageProvider(url), context)
            .catchError((_) {});
      }
    });
  }

  void _open(Restaurant r) => Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => RestaurantMenuScreen(api: widget.api, restaurant: r),
      ));

  void _openBanner(Map<String, dynamic> banner) {
    final target = banner['restaurant'];
    final id = target is Map ? (target['_id'] ?? target['id'])?.toString() : target?.toString();
    if (id == null) return;
    for (final restaurant in _restaurants) {
      if (restaurant.id == id) {
        _open(restaurant);
        return;
      }
    }
    _search.text = target is Map ? (target['name']?.toString() ?? '') : '';
    _load();
  }

  void _toggleSearch() {
    setState(() => _showSearch = !_showSearch);
    if (_showSearch) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _searchFocus.requestFocus();
      });
      return;
    }
    _searchFocus.unfocus();
    if (_search.text.isNotEmpty) {
      _search.clear();
      _load();
    }
  }

  IconData _categoryIcon(String category) {
    final c = category.trim().toLowerCase();

    if (c == 'الكل') return Icons.apps;
    if (c.contains('حلويات') || c.contains('مخبوز') || c.contains('معجن')) {
      return Icons.cake;
    }
    if (c.contains('كافي') || c.contains('قهوة') || c.contains('مشروب')) {
      return Icons.local_cafe;
    }
    if (c.contains('ملابس') || c.contains('ألبسة') || c.contains('البسة')) {
      return Icons.shopping_bag;
    }
    if (c.contains('كوزمت') ||
        c.contains('مكياج') ||
        c.contains('تجميل') ||
        c.contains('عناية') ||
        c.contains('عطر')) {
      return Icons.auto_awesome;
    }
    if (c.contains('مطعم') ||
        c.contains('وجبات') ||
        c.contains('برجر') ||
        c.contains('بيتزا') ||
        c.contains('دجاج')) {
      return Icons.restaurant;
    }
    if (c.contains('بقال') || c.contains('سوبر') || c.contains('ماركت')) {
      return Icons.shopping_cart;
    }
    if (c.contains('صيدل')) return Icons.local_hospital;
    if (c.contains('إلكترون') ||
        c.contains('الكترون') ||
        c.contains('موبايل') ||
        c.contains('هواتف')) {
      return Icons.phone_android;
    }
    if (c.contains('ورد') || c.contains('زهور') || c.contains('هدايا')) {
      return Icons.card_giftcard;
    }
    if (c.contains('كتب') || c.contains('مكتبة')) return Icons.menu_book;
    if (c.contains('ألعاب') || c.contains('العاب')) return Icons.sports_esports;
    if (c.contains('رياضة') || c.contains('رياضي')) return Icons.sports_soccer;

    return Icons.store;
  }

  Widget _topHeader() {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 6, 16, 12),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: AlignmentDirectional.topStart,
          end: AlignmentDirectional.bottomEnd,
          colors: const [
            Color(0xFFFFB45A),
            Color(0xFFFF8A2A),
          ],
        ),
        borderRadius: const BorderRadius.vertical(bottom: Radius.circular(30)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: dark ? .15 : .07),
            blurRadius: 18,
            offset: const Offset(0, 7),
          ),
        ],
      ),
      child: SafeArea(
        bottom: false,
        child: Row(
          children: [
            _headerAction(
              icon: _showSearch ? Icons.close_rounded : Icons.search,
              tooltip: _showSearch ? 'إغلاق البحث' : 'بحث',
              onTap: _toggleSearch,
            ),
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: const [
                  Text(
                    'Yalla',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 36,
                      height: 1,
                      fontWeight: FontWeight.w900,
                      fontStyle: FontStyle.italic,
                      letterSpacing: -.8,
                    ),
                  ),
                  SizedBox(height: 7),
                  Text(
                    'كل اللي تحبه .. يوصل لك',
                    textDirection: TextDirection.rtl,
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
            ),
            _headerAction(
              icon: Icons.favorite_border_rounded,
              tooltip: 'المفضلة',
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => FavoritesManageScreen(api: widget.api),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _headerAction({
    required IconData icon,
    required String tooltip,
    required VoidCallback onTap,
  }) =>
      Material(
        color: Colors.white.withValues(alpha: .12),
        shape: CircleBorder(
          side: BorderSide(color: Colors.white.withValues(alpha: .20), width: 1),
        ),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: Tooltip(
            message: tooltip,
            child: SizedBox.square(
              dimension: 40,
              child: Center(
                child: Icon(
                  icon,
                  color: Colors.white,
                  size: 22,
                ),
              ),
            ),
          ),
        ),
      );

  Widget _searchField() => AnimatedSwitcher(
        duration: const Duration(milliseconds: 220),
        child: !_showSearch
            ? const SizedBox.shrink()
            : Padding(
                key: const ValueKey('store-search'),
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                child: TextField(
                  focusNode: _searchFocus,
                  controller: _search,
                  onChanged: (_) {
                    setState(() {});
                    _debounce?.cancel();
                    _debounce = Timer(const Duration(milliseconds: 320), _load);
                  },
                  onSubmitted: (_) => _load(),
                  decoration: InputDecoration(
                    hintText: 'ابحث عن متجر، مطعم، أو اسم صنف...',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: _search.text.isEmpty
                        ? null
                        : IconButton(
                            onPressed: () {
                              _search.clear();
                              _load();
                            },
                            icon: const Icon(Icons.close_rounded),
                          ),
                    filled: true,
                    fillColor: YallaColors.surfaceContainer,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(20),
                      borderSide: BorderSide(
                        color: Theme.of(context).colorScheme.outlineVariant,
                        width: 1.1,
                      ),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(20),
                      borderSide: BorderSide(
                        color: Theme.of(context)
                            .colorScheme
                            .outlineVariant
                            .withValues(alpha: .85),
                        width: 1.1,
                      ),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(20),
                      borderSide: BorderSide(
                        color: YallaColors.primary,
                        width: 1.6,
                      ),
                    ),
                  ),
                ),
              ),
      );

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(toolbarHeight: 0),
        body: Column(children: [
          _topHeader(),
          _searchField(),
          if (_searching) const LinearProgressIndicator(minHeight: 2),
          if (_banners.isNotEmpty && _search.text.isEmpty) _bannerCarousel(),
          if (_categories.isNotEmpty)
            SizedBox(
              height: 46,
              child: ListView(
                scrollDirection: Axis.horizontal,
                physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
                padding: const EdgeInsets.symmetric(horizontal: 8),
                children: ['الكل', ..._categories].toSet().map((c) => Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 2),
                  child: ChoiceChip(
                    label: Row(
                      mainAxisSize: MainAxisSize.min,
                      textDirection: TextDirection.ltr,
                      children: [
                        SizedBox(
                          width: 18,
                          height: 18,
                          child: Center(
                            child: Icon(
                              _categoryIcon(c),
                              size: 17,
                              color: c == _category
                                  ? Colors.white
                                  : YallaColors.primary,
                            ),
                          ),
                        ),
                        const SizedBox(width: 5),
                        Text(c, maxLines: 1, softWrap: false),
                      ],
                    ),
                    selected: c == _category,
                    onSelected: (_) { setState(() => _category = c); _load(); },
                    showCheckmark: false,
                    selectedColor: YallaColors.primary,
                    side: BorderSide(
                      color: c == _category
                          ? YallaColors.primary
                          : Theme.of(context).colorScheme.outlineVariant.withValues(alpha: .9),
                      width: c == _category ? 1.4 : 1.0,
                    ),
                    labelStyle: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 12.4,
                      color: c == _category ? Colors.white : null,
                    ),
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
                    visualDensity: VisualDensity.compact,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
                  ),
                )).toList(),
              ),
            ),
          Expanded(child: _body()),
        ]),
      );

  Widget _bannerCarousel() => SizedBox(
        height: 154,
        child: Column(
          children: [
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: PageView.builder(
                  controller: _bannerController,
                  itemCount: _banners.length,
                  onPageChanged: (index) {
                    if (!mounted) return;
                    _bannerIndex.value = index;
                    _restartBannerTimer();
                  },
                  itemBuilder: (_, i) {
                    final b = Map<String, dynamic>.from(_banners[i] as Map);
                    final imageUrl = AppConfig.imageUrl((b['imageUrl'] ?? '').toString());
                    final subtitle = (b['subtitle'] ?? '').toString();
                    final coupon = (b['couponCode'] ?? '').toString();
                    return Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 4),
                      child: Material(
                        color: Colors.transparent,
                        child: InkWell(
                          onTap: () => _openBanner(b),
                          borderRadius: BorderRadius.circular(22),
                          child: Ink(
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(22),
                              gradient: LinearGradient(
                                begin: AlignmentDirectional.topStart,
                                end: AlignmentDirectional.bottomEnd,
                                colors: [
                                  YallaColors.primary,
                                  YallaColors.primary.withValues(alpha: .68),
                                ],
                              ),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: .12),
                                  blurRadius: 14,
                                  offset: const Offset(0, 6),
                                ),
                              ],
                            ),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(22),
                              child: Stack(
                                fit: StackFit.expand,
                                children: [
                                  if (imageUrl.isNotEmpty)
                                    WebSafeNetworkImage(
                                      url: imageUrl,
                                      fit: BoxFit.cover,
                                      cacheWidth: 900,
                                      placeholderBuilder: (_) => const SizedBox.shrink(),
                                      errorBuilder: (_) => const SizedBox.shrink(),
                                    ),
                                  if (imageUrl.isEmpty)
                                    DecoratedBox(
                                      decoration: BoxDecoration(
                                        gradient: LinearGradient(
                                          begin: Alignment.topCenter,
                                          end: Alignment.bottomCenter,
                                          colors: [
                                            Colors.black.withValues(alpha: .04),
                                            Colors.black.withValues(alpha: .24),
                                          ],
                                        ),
                                      ),
                                    ),
                                  if (coupon.isNotEmpty)
                                    Positioned(
                                      top: 10,
                                      left: 10,
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                                        decoration: BoxDecoration(
                                          color: Colors.white.withValues(alpha: .58),
                                          borderRadius: BorderRadius.circular(999),
                                          border: Border.all(
                                            color: Colors.white.withValues(alpha: .34),
                                            width: .8,
                                          ),
                                        ),
                                        child: Text(
                                          coupon,
                                          style: const TextStyle(
                                            color: Color(0xFFB95400),
                                            fontSize: 11.5,
                                            fontWeight: FontWeight.w900,
                                            letterSpacing: .15,
                                          ),
                                        ),
                                      ),
                                    ),
                                  if (imageUrl.isEmpty)
                                    PositionedDirectional(
                                      start: 16,
                                      end: 16,
                                      bottom: 13,
                                      child: Column(
                                        mainAxisSize: MainAxisSize.min,
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            b['title']?.toString() ?? '',
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: const TextStyle(
                                              color: Colors.white,
                                              fontSize: 18,
                                              fontWeight: FontWeight.w900,
                                              shadows: [Shadow(color: Colors.black45, blurRadius: 8)],
                                            ),
                                          ),
                                          if (subtitle.isNotEmpty) ...[
                                            const SizedBox(height: 2),
                                            Text(
                                              subtitle,
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              style: const TextStyle(
                                                color: Colors.white70,
                                                fontSize: 12.5,
                                                fontWeight: FontWeight.w600,
                                              ),
                                            ),
                                          ],
                                        ],
                                      ),
                                    ),

                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
            if (_banners.length > 1)
              ValueListenableBuilder<int>(
                valueListenable: _bannerIndex,
                builder: (context, bannerIndex, _) => Padding(
                  padding: const EdgeInsets.only(top: 2, bottom: 4),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(
                      _banners.length,
                      (i) => AnimatedContainer(
                        duration: const Duration(milliseconds: 220),
                        margin: const EdgeInsets.symmetric(horizontal: 3),
                        width: i == bannerIndex ? 18 : 6,
                        height: 6,
                        decoration: BoxDecoration(
                          color: i == bannerIndex
                              ? YallaColors.primary
                              : YallaColors.muted.withValues(alpha: .35),
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      );

  Widget _body() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error.isNotEmpty) return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
      Icon(Icons.wifi_off, size: 52, color: YallaColors.muted), const SizedBox(height: 10), Text(_error), const SizedBox(height: 10), OutlinedButton(onPressed: () => _load(initial: true), child: const Text('إعادة المحاولة')),
    ]));
    if (_restaurants.isEmpty) return const Center(child: Text('لا توجد نتائج مطابقة'));
    return LayoutBuilder(
      builder: (context, constraints) {
        final desktop = constraints.maxWidth >= 900;
        if (!desktop) {
          return RefreshIndicator(
            onRefresh: () => _load(initial: true),
            child: ListView.builder(
              cacheExtent: 700,
              padding: const EdgeInsets.fromLTRB(14, 8, 14, 24),
              itemCount: _restaurants.length,
              itemBuilder: (_, i) => KeyedSubtree(
                key: ValueKey('store-${_restaurants[i].id}'),
                child: _card(_restaurants[i]),
              ),
            ),
          );
        }
        return RefreshIndicator(
          onRefresh: () => _load(initial: true),
          child: GridView.builder(
            cacheExtent: 700,
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: 360,
              mainAxisExtent: 250,
              crossAxisSpacing: 16,
              mainAxisSpacing: 16,
            ),
            itemCount: _restaurants.length,
            itemBuilder: (_, i) => KeyedSubtree(
              key: ValueKey('store-${_restaurants[i].id}'),
              child: _desktopCard(_restaurants[i]),
            ),
          ),
        );
      },
    );
  }


  Widget _ratingBadge(Restaurant r, {bool compact = false}) {
    final hasRating = r.ratingCount > 0;
    final bg = hasRating
        ? Colors.black.withValues(alpha: .68)
        : YallaColors.primary.withValues(alpha: .94);
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 8 : 10,
        vertical: compact ? 5 : 6,
      ),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: .10),
            blurRadius: 8,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            hasRating ? Icons.star_rounded : Icons.auto_awesome_rounded,
            size: compact ? 14 : 16,
            color: hasRating ? const Color(0xFFFF9A3D) : Colors.white,
          ),
          const SizedBox(width: 4),
          Text(
            hasRating ? r.ratingAverage.toStringAsFixed(1) : 'جديد',
            style: TextStyle(
              color: Colors.white,
              fontSize: compact ? 11 : 12.5,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }

  Widget _closedStoreOverlay(Restaurant r) {
    final label = r.opensAtLabel.isNotEmpty ? r.opensAtLabel : 'مغلق حاليًا';
    return Stack(
      fit: StackFit.expand,
      children: [
        ColoredBox(color: Colors.black.withValues(alpha: .42)),
        Center(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: .96),
              borderRadius: BorderRadius.circular(999),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: .10),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              textDirection: TextDirection.rtl,
              children: [
                Icon(Icons.schedule_rounded, size: 18, color: YallaColors.primary),
                const SizedBox(width: 7),
                Text(
                  label,
                  style: TextStyle(
                    color: YallaColors.primary,
                    fontSize: 13,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _desktopCard(Restaurant r) => Card(
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide(
            color: Theme.of(context).colorScheme.outlineVariant.withValues(alpha: .8),
            width: 1.1,
          ),
        ),
        child: InkWell(
          onTap: () => _open(r),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    r.fullImageUrl == null
                        ? ColoredBox(
                            color: YallaColors.surfaceContainer,
                            child: const Center(
                              child: Icon(Icons.storefront_rounded, size: 42, color: Color(0xFF9AA0AA)),
                            ),
                          )
                        : WebSafeNetworkImage(
                            url: r.fullImageUrl!,
                            fit: BoxFit.cover,
                            cacheWidth: 900,
                            placeholderBuilder: (_) => ColoredBox(
                              color: YallaColors.surfaceContainer,
                            ),
                            errorBuilder: (_) => ColoredBox(
                              color: YallaColors.surfaceContainer,
                              child: const Center(
                                child: Icon(Icons.storefront_rounded, size: 42, color: Color(0xFF9AA0AA)),
                              ),
                            ),
                          ),
                    if (!r.openNow) _closedStoreOverlay(r),
                    PositionedDirectional(
                      top: 10,
                      end: 10,
                      child: _ratingBadge(r, compact: true),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(r.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
                    const SizedBox(height: 3),
                    Text(r.category, style: TextStyle(color: YallaColors.muted, fontSize: 12)),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 10,
                      runSpacing: 4,
                      children: [
                        if (r.prepMinutes > 0) Text('${r.prepMinutes} دقيقة'),
                        if (r.minOrder > 0) Text('أقل طلب ${r.minOrder} ₪'),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );

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

  Widget _card(Restaurant r) => Container(
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
                alpha: Theme.of(context).brightness == Brightness.dark ? .12 : .05,
              ),
              blurRadius: 18,
              offset: const Offset(0, 7),
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: () => _open(r),
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
                                placeholderBuilder: (_) => ColoredBox(
                                  color: YallaColors.surfaceContainer,
                                ),
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
                          Text(
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
                          const SizedBox(height: 5),
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

}