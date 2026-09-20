import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/web_safe_network_image.dart';
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
  final _bannerController = PageController(viewportFraction: .94);
  Timer? _debounce;
  Timer? _bannerTimer;
  int _bannerIndex = 0;
  int _serial = 0;
  List<Restaurant> _restaurants = [];
  List<String> _categories = [];
  List<dynamic> _banners = [];
  String _category = 'الكل';
  bool _loading = true;
  bool _searching = false;
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
    _search.dispose();
    super.dispose();
  }

  void _restartBannerTimer() {
    _bannerTimer?.cancel();
    if (_banners.length <= 1) return;
    _bannerTimer = Timer.periodic(const Duration(seconds: 4), (_) {
      if (!mounted || !_bannerController.hasClients || _banners.length <= 1) return;
      final next = (_bannerIndex + 1) % _banners.length;
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
      if (initial || _categories.isEmpty) {
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
        return a.name.compareTo(b.name);
      });
      final bannersChanged = nextBanners != null;
      setState(() {
        if (nextCategories != null) _categories = nextCategories!;
        if (nextBanners != null) {
          _banners = nextBanners!;
          _bannerIndex = 0;
        }
        _restaurants = list;
      });
      if (bannersChanged) {
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

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(toolbarHeight: 0),
        body: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              controller: _search,
              onChanged: (_) {
                setState(() {});
                _debounce?.cancel();
                _debounce = Timer(const Duration(milliseconds: 320), _load);
              },
              onSubmitted: (_) => _load(),
              decoration: InputDecoration(
                hintText: 'ابحث عن متجر، مطعم، أو اسم صنف...',
                prefixIcon: const Icon(Icons.search_rounded),
                suffixIcon: _search.text.isEmpty ? null : IconButton(onPressed: () { _search.clear(); _load(); }, icon: const Icon(Icons.close_rounded)),
                filled: true,
                fillColor: YallaColors.surfaceContainer,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(20),
                  borderSide: BorderSide.none,
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(20),
                  borderSide: BorderSide.none,
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(20),
                  borderSide: BorderSide(color: YallaColors.primary, width: 1.4),
                ),
              ),
            ),
          ),
          if (_searching) const LinearProgressIndicator(minHeight: 2),
          if (_banners.isNotEmpty && _search.text.isEmpty) _bannerCarousel(),
          if (_categories.isNotEmpty)
            SizedBox(
              height: 46,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                children: ['الكل', ..._categories].toSet().map((c) => Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: ChoiceChip(
                    label: Text(c),
                    selected: c == _category,
                    onSelected: (_) { setState(() => _category = c); _load(); },
                    showCheckmark: false,
                    selectedColor: YallaColors.primary,
                    side: BorderSide.none,
                    labelStyle: TextStyle(
                      fontWeight: FontWeight.w800,
                      color: c == _category ? Colors.white : null,
                    ),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
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
                    setState(() => _bannerIndex = index);
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
                                  DecoratedBox(
                                    decoration: BoxDecoration(
                                      gradient: LinearGradient(
                                        begin: Alignment.topCenter,
                                        end: Alignment.bottomCenter,
                                        colors: [
                                          Colors.black.withValues(alpha: imageUrl.isEmpty ? .04 : .08),
                                          Colors.black.withValues(alpha: imageUrl.isEmpty ? .20 : .68),
                                        ],
                                      ),
                                    ),
                                  ),
                                  PositionedDirectional(
                                    top: 12,
                                    start: 12,
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                                      decoration: BoxDecoration(
                                        color: Colors.black.withValues(alpha: .48),
                                        borderRadius: BorderRadius.circular(999),
                                      ),
                                      child: const Text(
                                        'إعلان',
                                        style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800),
                                      ),
                                    ),
                                  ),
                                  PositionedDirectional(
                                    start: 16,
                                    end: 16,
                                    bottom: 13,
                                    child: Row(
                                      crossAxisAlignment: CrossAxisAlignment.end,
                                      children: [
                                        Expanded(
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
                                                  style: const TextStyle(color: Colors.white70, fontSize: 12.5, fontWeight: FontWeight.w600),
                                                ),
                                              ],
                                            ],
                                          ),
                                        ),
                                        if (coupon.isNotEmpty)
                                          Container(
                                            margin: const EdgeInsetsDirectional.only(start: 8),
                                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                            decoration: BoxDecoration(
                                              color: Colors.white.withValues(alpha: .92),
                                              borderRadius: BorderRadius.circular(10),
                                            ),
                                            child: Text(
                                              coupon,
                                              style: TextStyle(color: YallaColors.primary, fontSize: 11.5, fontWeight: FontWeight.w900),
                                            ),
                                          ),
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
              Padding(
                padding: const EdgeInsets.only(top: 2, bottom: 4),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: List.generate(
                    _banners.length,
                    (i) => AnimatedContainer(
                      duration: const Duration(milliseconds: 220),
                      margin: const EdgeInsets.symmetric(horizontal: 3),
                      width: i == _bannerIndex ? 18 : 6,
                      height: 6,
                      decoration: BoxDecoration(
                        color: i == _bannerIndex ? YallaColors.primary : YallaColors.muted.withValues(alpha: .35),
                        borderRadius: BorderRadius.circular(999),
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
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
              itemCount: _restaurants.length,
              itemBuilder: (_, i) => _card(_restaurants[i]),
            ),
          );
        }
        return RefreshIndicator(
          onRefresh: () => _load(initial: true),
          child: GridView.builder(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: 360,
              mainAxisExtent: 250,
              crossAxisSpacing: 16,
              mainAxisSpacing: 16,
            ),
            itemCount: _restaurants.length,
            itemBuilder: (_, i) => _desktopCard(_restaurants[i]),
          ),
        );
      },
    );
  }


  Widget _desktopCard(Restaurant r) => Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => _open(r),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Container(
                      color: Colors.white,
                      padding: const EdgeInsets.all(8),
                      child: r.fullImageUrl == null
                          ? const Icon(Icons.storefront_rounded, size: 42, color: Color(0xFF9AA0AA))
                          : WebSafeNetworkImage(
                              url: r.fullImageUrl!,
                              fit: BoxFit.contain,
                              cacheWidth: 900,
                              placeholderBuilder: (_) => const SizedBox.shrink(),
                              errorBuilder: (_) => const Icon(Icons.storefront_rounded, size: 42, color: Color(0xFF9AA0AA)),
                            ),
                    ),
                    PositionedDirectional(
                      top: 10,
                      end: 10,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: .68),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.star_rounded, size: 14, color: Color(0xFFFF9A3D)),
                            const SizedBox(width: 4),
                            Text(
                              r.ratingCount > 0 ? r.ratingAverage.toStringAsFixed(1) : '—',
                              style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w900),
                            ),
                          ],
                        ),
                      ),
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
                        if (r.prepMinutes > 0) Text('~${r.prepMinutes} د'),
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
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        decoration: BoxDecoration(
          color: YallaColors.surfaceContainer,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: YallaColors.primary),
            const SizedBox(width: 4),
            Text(label, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700)),
          ],
        ),
      );

  Widget _card(Restaurant r) => Container(
        margin: const EdgeInsets.only(bottom: 14),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: Theme.of(context).dividerColor.withValues(alpha: .28)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: Theme.of(context).brightness == Brightness.dark ? .12 : .05),
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
              height: 190,
              child: Column(
                children: [
                  SizedBox(
                    height: 104,
                    width: double.infinity,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        Container(
                          color: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          child: r.fullImageUrl == null
                              ? const Icon(Icons.storefront_rounded, size: 40, color: Color(0xFF9AA0AA))
                              : WebSafeNetworkImage(
                                  url: r.fullImageUrl!,
                                  fit: BoxFit.contain,
                                  cacheWidth: 900,
                                  placeholderBuilder: (_) => const SizedBox.shrink(),
                                  errorBuilder: (_) => const Icon(Icons.storefront_rounded, size: 40, color: Color(0xFF9AA0AA)),
                                ),
                        ),
                        PositionedDirectional(
                          top: 10,
                          end: 10,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            decoration: BoxDecoration(
                              color: Colors.black.withValues(alpha: .72),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.star_rounded, size: 15, color: Color(0xFFFF9A3D)),
                                const SizedBox(width: 4),
                                Text(
                                  r.ratingCount > 0 ? r.ratingAverage.toStringAsFixed(1) : '—',
                                  style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w900),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                      child: Column(
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  r.name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Flexible(
                                child: Text(
                                  r.category,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(color: YallaColors.muted, fontSize: 12.5, fontWeight: FontWeight.w700),
                                ),
                              ),
                            ],
                          ),
                          const Spacer(),
                          Row(
                            children: [
                              if (r.prepMinutes > 0)
                                _metricPill(Icons.schedule_rounded, '~${r.prepMinutes} د'),
                              if (r.prepMinutes > 0 && r.minOrder > 0)
                                const SizedBox(width: 7),
                              if (r.minOrder > 0)
                                _metricPill(Icons.shopping_bag_outlined, 'من ${r.minOrder} ₪'),
                              const Spacer(),
                              if (!r.openNow && r.opensAtLabel.isNotEmpty)
                                Flexible(
                                  child: Text(
                                    r.opensAtLabel,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    textAlign: TextAlign.end,
                                    style: TextStyle(color: YallaColors.error, fontSize: 11.5, fontWeight: FontWeight.w700),
                                  ),
                                ),
                            ],
                          ),
                        ],
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