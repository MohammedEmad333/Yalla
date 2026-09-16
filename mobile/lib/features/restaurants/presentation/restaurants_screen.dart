import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/api_client.dart';
import '../../../core/theme/app_theme.dart';
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
  Timer? _debounce;
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
    _search.dispose();
    super.dispose();
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
      setState(() {
        if (nextCategories != null) _categories = nextCategories!;
        if (nextBanners != null) _banners = nextBanners!;
        _restaurants = list;
      });
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
        appBar: AppBar(title: const Text('المتاجر والمطاعم')),
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
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _search.text.isEmpty ? null : IconButton(onPressed: () { _search.clear(); _load(); }, icon: const Icon(Icons.close)),
              ),
            ),
          ),
          if (_searching) const LinearProgressIndicator(minHeight: 2),
          if (_banners.isNotEmpty && _search.text.isEmpty) _bannerStrip(),
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
                  ),
                )).toList(),
              ),
            ),
          Expanded(child: _body()),
        ]),
      );

  Widget _bannerStrip() => SizedBox(
        height: 122,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
          itemCount: _banners.length,
          separatorBuilder: (_, __) => const SizedBox(width: 10),
          itemBuilder: (_, i) {
            final b = Map<String, dynamic>.from(_banners[i] as Map);
            final image = (b['imageUrl'] ?? '').toString();
            final fullImage = image.isEmpty ? '' : (image.startsWith('http') ? image : '${AppConfig.origin}$image');
            return InkWell(
              onTap: () => _openBanner(b),
              borderRadius: BorderRadius.circular(18),
              child: Container(
                width: 270,
                clipBehavior: Clip.antiAlias,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(18),
                  gradient: LinearGradient(colors: [YallaColors.primary, YallaColors.primary.withValues(alpha: .72)]),
                ),
                child: Stack(fit: StackFit.expand, children: [
                  if (fullImage.isNotEmpty) CachedNetworkImage(imageUrl: fullImage, fit: BoxFit.cover, errorWidget: (_, __, ___) => const SizedBox()),
                  Container(color: Colors.black.withValues(alpha: fullImage.isEmpty ? .05 : .38)),
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.end, children: [
                      Text(b['title']?.toString() ?? '', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900)),
                      if ((b['subtitle'] ?? '').toString().isNotEmpty) Text(b['subtitle'].toString(), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white70)),
                      if ((b['couponCode'] ?? '').toString().isNotEmpty) Text('كود: ${b['couponCode']}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    ]),
                  ),
                ]),
              ),
            );
          },
        ),
      );

  Widget _body() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error.isNotEmpty) return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
      Icon(Icons.wifi_off, size: 52, color: YallaColors.muted), const SizedBox(height: 10), Text(_error), const SizedBox(height: 10), OutlinedButton(onPressed: () => _load(initial: true), child: const Text('إعادة المحاولة')),
    ]));
    if (_restaurants.isEmpty) return const Center(child: Text('لا توجد نتائج مطابقة'));
    return RefreshIndicator(
      onRefresh: () => _load(initial: true),
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        itemCount: _restaurants.length,
        itemBuilder: (_, i) => _card(_restaurants[i]),
      ),
    );
  }

  Widget _card(Restaurant r) => Card(
        margin: const EdgeInsets.only(bottom: 12),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => _open(r),
          child: Row(children: [
            SizedBox(
              width: 112,
              height: 112,
              child: r.fullImageUrl == null
                  ? Container(color: YallaColors.surfaceContainer, child: const Icon(Icons.storefront, size: 36))
                  : CachedNetworkImage(imageUrl: r.fullImageUrl!, fit: BoxFit.cover, memCacheWidth: 400, errorWidget: (_, __, ___) => const Icon(Icons.storefront)),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [Expanded(child: Text(r.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900))), const SizedBox(width: 6), Icon(Icons.circle, size: 9, color: r.openNow ? YallaColors.success : YallaColors.error)]),
                  const SizedBox(height: 5),
                  Text(r.category, style: TextStyle(color: YallaColors.muted)),
                  const SizedBox(height: 7),
                  Wrap(spacing: 8, runSpacing: 4, children: [
                    if (r.ratingCount > 0) Text('⭐ ${r.ratingAverage.toStringAsFixed(1)}'),
                    if (r.prepMinutes > 0) Text('~${r.prepMinutes} د'),
                    if (r.minOrder > 0) Text('أقل طلب ${r.minOrder} ₪'),
                  ]),
                  if (!r.openNow) Text(r.opensAtLabel.isEmpty ? 'مغلق حاليًا' : r.opensAtLabel, style: TextStyle(color: YallaColors.error, fontSize: 12)),
                ]),
              ),
            ),
          ]),
        ),
      );
}
