// صفحة المطاعم (Card 110) — يختار المستخدم مطعمًا فتُفتح قائمته ويطلب منه مباشرةً.
// تعرض بحثًا بالاسم، رقائق تصنيف (مشاوي/شاورما/بيتزا/حلويات...)، وقائمة بطاقات
// المطاعم مع صورة وتصنيف والحدّ الأدنى وزمن التحضير وحالة الفتح/الإغلاق.

import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

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
  final _searchController = TextEditingController();
  Timer? _searchDebounce;
  int _requestSerial = 0;

  List<Restaurant> _restaurants = [];
  List<String> _categories = [];
  String _category = 'الكل';
  bool _loading = true;
  bool _searching = false;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final requestId = ++_requestSerial;
    final hasContent = _restaurants.isNotEmpty;
    setState(() {
      _loading = !hasContent;
      _searching = hasContent;
      _error = '';
    });

    try {
      List<String>? categories;
      late final List<Restaurant> list;

      // عند الفتح لأول مرة نطلب التصنيفات والمطاعم بالتوازي بدل انتظار
      // استجابة التصنيفات قبل بدء طلب القائمة.
      if (_categories.isEmpty) {
        final results = await Future.wait<Object>([
          _repo.categories(),
          _repo.list(category: _category, q: _searchController.text),
        ]);
        categories = (results[0] as List).cast<String>();
        list = (results[1] as List).cast<Restaurant>();
      } else {
        list = await _repo.list(category: _category, q: _searchController.text);
      }

      // إذا سبق هذا الطلب طلب أحدث (كتابة سريعة في البحث) نتجاهل نتيجته
      // حتى لا تظهر نتائج قديمة بعد النتائج الجديدة.
      if (!mounted || requestId != _requestSerial) return;

      final open = list.where((r) => r.openNow).toList();
      final closed = list.where((r) => !r.openNow).toList();
      setState(() {
        if (categories != null) _categories = categories!;
        _restaurants = [...open, ...closed];
      });
    } on ApiException catch (e) {
      if (mounted && requestId == _requestSerial) {
        setState(() => _error = e.message);
      }
    } catch (_) {
      if (mounted && requestId == _requestSerial) {
        setState(() => _error = 'تعذّر تحميل المطاعم — تحقّق من الاتصال');
      }
    } finally {
      if (mounted && requestId == _requestSerial) {
        setState(() {
          _loading = false;
          _searching = false;
        });
      }
    }
  }

  void _openRestaurant(Restaurant r) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => RestaurantMenuScreen(api: widget.api, restaurant: r),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('المطاعم')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              controller: _searchController,
              textInputAction: TextInputAction.search,
              onChanged: (_) {
                setState(() {}); // لإظهار/إخفاء زرّ المسح
                _searchDebounce?.cancel();
                _searchDebounce = Timer(
                  const Duration(milliseconds: 350),
                  _load,
                );
              },
              onSubmitted: (_) {
                _searchDebounce?.cancel();
                _load();
              },
              decoration: InputDecoration(
                hintText: 'ابحث عن مطعم...',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _searchController.text.isEmpty
                    ? null
                    : IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () {
                          _searchDebounce?.cancel();
                          _searchController.clear();
                          _load();
                        },
                      ),
              ),
            ),
          ),

          if (_searching) const LinearProgressIndicator(minHeight: 2),

          // رقائق التصنيف
          if (_categories.isNotEmpty)
            SizedBox(
              height: 44,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                children: ['الكل', ..._categories].map((c) {
                  final selected = c == _category;
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: ChoiceChip(
                      label: Text(c),
                      selected: selected,
                      onSelected: (_) {
                        _searchDebounce?.cancel();
                        setState(() => _category = c);
                        _load();
                      },
                    ),
                  );
                }).toList(),
              ),
            ),

          Expanded(child: _body()),
        ],
      ),
    );
  }

  Widget _body() {
    if (_loading) return const Center(child: CircularProgressIndicator());

    if (_error.isNotEmpty) {
      return _placeholder(Icons.wifi_off, _error, action: 'إعادة المحاولة');
    }
    if (_restaurants.isEmpty) {
      return _placeholder(Icons.storefront_outlined, 'لا توجد مطاعم متاحة حاليًا');
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        itemCount: _restaurants.length,
        itemBuilder: (_, i) => _restaurantCard(_restaurants[i]),
      ),
    );
  }

  // حالة فارغة/خطأ مع زرّ إعادة المحاولة
  Widget _placeholder(IconData icon, String text, {String? action}) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 56, color: YallaColors.muted),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 32),
              child: Text(text, textAlign: TextAlign.center),
            ),
            if (action != null) ...[
              const SizedBox(height: 12),
              OutlinedButton(onPressed: _load, child: Text(action)),
            ],
          ],
        ),
      );

  Widget _restaurantCard(Restaurant r) => Card(
        margin: const EdgeInsets.only(bottom: 12),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => _openRestaurant(r),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // صورة الغلاف (أو بديل بلون العلامة إن لم تُضبط صورة)
              SizedBox(
                height: 170,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    if (r.fullImageUrl != null)
                      CachedNetworkImage(
                        imageUrl: r.fullImageUrl!,
                        fit: BoxFit.cover,
                        memCacheWidth: 900,
                        maxWidthDiskCache: 1200,
                        fadeInDuration: const Duration(milliseconds: 180),
                        placeholder: (_, __) => _imageLoading(),
                        errorWidget: (_, __, ___) => _imageFallback(),
                      )
                    else
                      _imageFallback(),
                    if (!r.openNow)
                      Container(
                        color: Colors.black54,
                        alignment: Alignment.center,
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Text(
                              'مغلق حاليًا',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            if (r.opensAtLabel.isNotEmpty) ...[
                              const SizedBox(height: 4),
                              Text(
                                r.opensAtLabel,
                                style: const TextStyle(color: Colors.white, fontSize: 13),
                              ),
                            ],
                          ],
                        ),
                      ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            r.name,
                            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
                          ),
                        ),
                        if (r.category.isNotEmpty)
                          Chip(
                            label: Text(r.category),
                            visualDensity: VisualDensity.compact,
                            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          ),
                      ],
                    ),
                    if (r.description.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        r.description,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: YallaColors.muted, fontSize: 13),
                      ),
                    ],
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 12,
                      runSpacing: 4,
                      children: [
                        if (r.scheduleLabel.isNotEmpty)
                          _meta(Icons.access_time, r.scheduleLabel),
                        if (r.address.isNotEmpty) _meta(Icons.place_outlined, r.address),
                        if (r.prepMinutes > 0)
                          _meta(Icons.timer_outlined, '~${r.prepMinutes} دقيقة تحضير'),
                        if (r.minOrder > 0)
                          _meta(Icons.shopping_basket_outlined, 'الحدّ الأدنى ${r.minOrder} ₪'),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );

  Widget _imageLoading() => Container(
        color: YallaColors.primaryContainer,
        alignment: Alignment.center,
        child: const SizedBox(
          width: 24,
          height: 24,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );

  Widget _imageFallback() => Container(
        color: YallaColors.primaryContainer,
        alignment: Alignment.center,
        child: Icon(Icons.restaurant, size: 44, color: YallaColors.primaryDeep),
      );

  Widget _meta(IconData icon, String text) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: YallaColors.muted),
          const SizedBox(width: 4),
          Text(text, style: TextStyle(color: YallaColors.muted, fontSize: 12)),
        ],
      );

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }
}
