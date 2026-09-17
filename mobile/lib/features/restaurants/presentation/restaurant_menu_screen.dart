import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/network/api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../data/cart_storage.dart';
import '../data/restaurant_repository.dart';
import 'checkout_screen.dart';

class RestaurantMenuScreen extends StatefulWidget {
  final ApiClient api;
  final Restaurant restaurant;
  const RestaurantMenuScreen({super.key, required this.api, required this.restaurant});

  @override
  State<RestaurantMenuScreen> createState() => _RestaurantMenuScreenState();
}

class _RestaurantMenuScreenState extends State<RestaurantMenuScreen> {
  static const _favoritesStorageKey = 'favorite_restaurant_ids';

  late final RestaurantRepository _repo = RestaurantRepository(widget.api);
  late Restaurant _restaurant = widget.restaurant;
  late final Cart _cart = Cart(widget.restaurant);
  final FlutterSecureStorage _secureStorage = const FlutterSecureStorage();

  final ScrollController _scrollController = ScrollController();
  List<MenuSection> _menu = [];
  List<GlobalKey> _sectionKeys = [];
  bool _loading = true;
  bool _rating = false;
  bool _favorite = false;
  bool _favoriteBusy = false;
  String _error = '';
  int _selectedSection = 0;

  @override
  void initState() {
    super.initState();
    _loadFavorite();
    _load();
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _loadFavorite() async {
    try {
      final raw = await _secureStorage.read(key: _favoritesStorageKey) ?? '';
      final ids = raw.split('|').where((id) => id.isNotEmpty).toSet();
      if (mounted) setState(() => _favorite = ids.contains(widget.restaurant.id));
    } catch (_) {
      // المفضلة تحسين اختياري ولا ينبغي أن تمنع فتح قائمة المتجر.
    }
  }

  Future<void> _toggleFavorite() async {
    if (_favoriteBusy) return;
    setState(() => _favoriteBusy = true);
    try {
      final raw = await _secureStorage.read(key: _favoritesStorageKey) ?? '';
      final ids = raw.split('|').where((id) => id.isNotEmpty).toSet();
      final willFavorite = !ids.contains(_restaurant.id);
      if (willFavorite) {
        ids.add(_restaurant.id);
      } else {
        ids.remove(_restaurant.id);
      }
      await _secureStorage.write(key: _favoritesStorageKey, value: ids.join('|'));
      if (!mounted) return;
      setState(() => _favorite = willFavorite);
      _snack(willFavorite ? 'تمت إضافة المتجر إلى المفضلة' : 'تمت إزالة المتجر من المفضلة');
    } catch (_) {
      if (mounted) _snack('تعذّر تحديث المفضلة');
    } finally {
      if (mounted) setState(() => _favoriteBusy = false);
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final (restaurant, menu) = await _repo.getWithMenu(widget.restaurant.id);
      if (!mounted) return;
      _restaurant = restaurant;
      _menu = menu;
      _sectionKeys = List.generate(menu.length, (_) => GlobalKey());
      _selectedSection = 0;
      await _restoreCart();
      if (mounted) setState(() {});
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'تعذّر تحميل القائمة');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _restoreCart() async {
    if (!_cart.isEmpty) return;
    final draft = await CartStorage.read();
    if (draft == null || draft['restaurantId']?.toString() != _restaurant.id) return;
    final items = (draft['items'] as List?) ?? const [];
    final byId = <String, MenuItemModel>{};
    for (final section in _menu) {
      for (final item in section.items) {
        byId[item.id] = item;
      }
    }
    for (final raw in items) {
      final row = Map<String, dynamic>.from(raw as Map);
      final item = byId[row['menuItemId']?.toString()];
      if (item == null || !item.available) continue;
      MenuVariant? variant;
      final variantName = row['variant']?.toString() ?? '';
      if (variantName.isNotEmpty) {
        for (final v in item.variants) {
          if (v.label == variantName) {
            variant = v;
            break;
          }
        }
        if (item.variants.isNotEmpty && variant == null) continue;
      }
      final selections = <SelectedMenuOption>[];
      for (final optionRaw in (row['options'] as List?) ?? const []) {
        final optionMap = Map<String, dynamic>.from(optionRaw as Map);
        final groupName = optionMap['group']?.toString() ?? '';
        final optionName = optionMap['option']?.toString() ?? '';
        MenuOption? found;
        for (final group in item.optionGroups.where((g) => g.name == groupName)) {
          for (final option in group.options) {
            if (option.name == optionName) {
              found = option;
              break;
            }
          }
        }
        if (found != null) {
          selections.add(SelectedMenuOption(groupName, found.name, found.price));
        }
      }
      final qty = ((row['qty'] as num?) ?? 1).toInt().clamp(1, 50);
      for (var i = 0; i < qty; i++) {
        _cart.add(item, variant: variant, options: selections);
      }
    }
  }

  Future<void> _persistCart() => CartStorage.save(
        restaurantId: _restaurant.id,
        items: _cart.toItemsPayload(),
      );

  Future<void> _showItemDetails(MenuItemModel item) async {
    final choice = await showModalBottomSheet<_ItemChoice>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ItemDetailsSheet(item: item),
    );
    if (choice == null || !mounted || !item.available) return;
    setState(() => _cart.add(item, variant: choice.variant, options: choice.options));
    await _persistCart();
  }

  Future<void> _quickAddItem(MenuItemModel item) async {
    if (!item.available) return;

    final variant = item.variants.isNotEmpty ? item.variants.first : null;
    final selections = <SelectedMenuOption>[];
    for (final group in item.optionGroups) {
      final minimum = group.required ? (group.minSelect < 1 ? 1 : group.minSelect) : group.minSelect;
      if (minimum <= 0) continue;

      final take = group.multiple ? minimum : 1;
      if (group.options.length < take) {
        await _showItemDetails(item);
        return;
      }
      for (final option in group.options.take(take)) {
        selections.add(SelectedMenuOption(group.name, option.name, option.price));
      }
    }

    if (!mounted) return;
    setState(() => _cart.add(item, variant: variant, options: selections));
    await _persistCart();
  }

  Future<void> _checkout() async {
    if (!_restaurant.openNow) return _snack('المتجر مغلق حاليًا');
    if (!_cart.meetsMinOrder) return _snack('الحد الأدنى للطلب ${_restaurant.minOrder} ₪');
    final placed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => CheckoutScreen(api: widget.api, cart: _cart)),
    );
    if (!mounted) return;
    if (placed == true) {
      await CartStorage.clear();
      if (mounted) Navigator.of(context).pop();
      return;
    }
    await _persistCart();
    if (mounted) setState(() {});
  }

  Future<void> _rate() async {
    final stars = await showDialog<int>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('قيّم المتجر'),
        content: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(
            5,
            (i) => IconButton(
              onPressed: () => Navigator.pop(ctx, i + 1),
              icon: const Icon(Icons.star_rounded, color: Color(0xFFFFB300), size: 34),
            ),
          ),
        ),
      ),
    );
    if (stars == null) return;
    setState(() => _rating = true);
    try {
      await _repo.rate(_restaurant.id, stars);
      await _load();
    } on ApiException catch (e) {
      _snack(e.message);
    } finally {
      if (mounted) setState(() => _rating = false);
    }
  }

  String get _todayHoursLabel {
    final today = _restaurant.todayHours;
    if (today != null) {
      if (today.closed) return 'مغلق اليوم';
      if (today.open.trim().isNotEmpty && today.close.trim().isNotEmpty) {
        return 'ساعات اليوم: ${today.open} - ${today.close}';
      }
    }
    if (_restaurant.openTime.trim().isNotEmpty && _restaurant.closeTime.trim().isNotEmpty) {
      return 'ساعات اليوم: ${_restaurant.openTime} - ${_restaurant.closeTime}';
    }
    return '';
  }

  Future<void> _callStore() async {
    final phone = _restaurant.phone.trim();
    if (phone.isEmpty) return;
    final normalized = phone.replaceAll(RegExp(r'[^0-9+]'), '');
    final uri = Uri(scheme: 'tel', path: normalized);
    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened && mounted) _snack('تعذّر فتح تطبيق الاتصال');
  }

  void _snack(String text) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));

  Future<void> _scrollToSection(int index) async {
    if (index < 0 || index >= _sectionKeys.length) return;
    setState(() => _selectedSection = index);
    final target = _sectionKeys[index].currentContext;
    if (target == null) return;
    await Scrollable.ensureVisible(
      target,
      duration: const Duration(milliseconds: 420),
      curve: Curves.easeOutCubic,
      alignment: 0.08,
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: Text(_restaurant.name),
          actions: [
            IconButton(
              tooltip: 'تحديث',
              onPressed: _load,
              icon: const Icon(Icons.refresh_rounded),
            ),
          ],
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error.isNotEmpty
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_error),
                        const SizedBox(height: 12),
                        FilledButton(onPressed: _load, child: const Text('إعادة المحاولة')),
                      ],
                    ),
                  )
                : RefreshIndicator(onRefresh: _load, child: _content()),
        bottomNavigationBar: _cart.isEmpty ? null : _cartBar(),
      );

  Widget _content() {
    final children = <Widget>[];
    for (var i = 0; i < _menu.length; i++) {
      final section = _menu[i];
      children.add(
        Padding(
          key: _sectionKeys[i],
          padding: const EdgeInsets.fromLTRB(16, 22, 16, 10),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(section.category, style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w900)),
              Text('${section.items.length}', style: TextStyle(color: YallaColors.muted, fontWeight: FontWeight.w700)),
            ],
          ),
        ),
      );
      children.addAll(section.items.map(_itemTile));
    }

    return CustomScrollView(
      controller: _scrollController,
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        SliverToBoxAdapter(child: _restaurantHero()),
        SliverPersistentHeader(
          pinned: true,
          delegate: _CategoryHeaderDelegate(
            height: _menu.isEmpty ? 0 : 70,
            child: _menu.isEmpty ? const SizedBox.shrink() : _categoryBar(),
          ),
        ),
        if (_menu.isEmpty)
          const SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.all(36),
              child: Center(child: Text('لا توجد أصناف بعد')),
            ),
          )
        else
          SliverList(delegate: SliverChildListDelegate(children)),
        const SliverToBoxAdapter(child: SizedBox(height: 120)),
      ],
    );
  }

  Widget _restaurantHero() => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Stack(
            children: [
              if (_restaurant.fullImageUrl != null)
                CachedNetworkImage(
                  imageUrl: _restaurant.fullImageUrl!,
                  height: 230,
                  width: double.infinity,
                  fit: BoxFit.cover,
                  placeholder: (_, __) => const SizedBox(
                    height: 230,
                    child: Center(child: CircularProgressIndicator()),
                  ),
                  errorWidget: (_, __, ___) => _imageFallback(),
                )
              else
                _imageFallback(),
              Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [Colors.transparent, Colors.black.withValues(alpha: 0.55)],
                    ),
                  ),
                ),
              ),
              PositionedDirectional(
                top: 14,
                end: 14,
                child: Material(
                  color: Colors.white.withValues(alpha: 0.94),
                  shape: const CircleBorder(),
                  elevation: 2,
                  child: IconButton(
                    onPressed: _favoriteBusy ? null : _toggleFavorite,
                    tooltip: _favorite ? 'إزالة من المفضلة' : 'إضافة للمفضلة',
                    icon: Icon(
                      _favorite ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                      color: _favorite ? const Color(0xFFE53935) : const Color(0xFF071D3A),
                    ),
                  ),
                ),
              ),
              Positioned(
                left: 16,
                right: 16,
                bottom: 16,
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      child: Text(
                        _restaurant.name,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 28,
                          height: 1,
                          fontWeight: FontWeight.w900,
                          shadows: [Shadow(color: Colors.black45, blurRadius: 8)],
                        ),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: _restaurant.openNow ? const Color(0xFFDDF7E8) : const Color(0xFFFFE4E1),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        _restaurant.openNow ? 'مفتوح الآن' : 'مغلق',
                        style: TextStyle(
                          color: _restaurant.openNow ? const Color(0xFF137A45) : YallaColors.error,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          if (_restaurant.ratingCount > 0)
                            _infoPill(
                              Icons.star_rounded,
                              '${_restaurant.ratingAverage.toStringAsFixed(1)} (${_restaurant.ratingCount})',
                              iconColor: const Color(0xFFFFB300),
                            ),
                          if (_restaurant.prepMinutes > 0)
                            _infoPill(Icons.schedule_rounded, 'تحضير ~${_restaurant.prepMinutes} دقيقة'),
                          if (_restaurant.minOrder > 0)
                            _infoPill(Icons.shopping_bag_outlined, 'حد أدنى ${_restaurant.minOrder} ₪'),
                        ],
                      ),
                    ),
                    IconButton.filledTonal(
                      onPressed: _rating ? null : _rate,
                      tooltip: 'تقييم المتجر',
                      style: IconButton.styleFrom(
                        backgroundColor: const Color(0xFFFFF3CD),
                        foregroundColor: const Color(0xFFFFB300),
                      ),
                      icon: const Icon(Icons.star_rounded, color: Color(0xFFFFB300)),
                    ),
                  ],
                ),
                if (_restaurant.description.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text(_restaurant.description, style: TextStyle(color: YallaColors.muted, height: 1.45)),
                ],
                if (_todayHoursLabel.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Icon(Icons.schedule_outlined, size: 19, color: YallaColors.muted),
                      const SizedBox(width: 7),
                      Expanded(
                        child: Text(
                          _todayHoursLabel,
                          style: TextStyle(color: YallaColors.muted, fontWeight: FontWeight.w700),
                        ),
                      ),
                    ],
                  ),
                ],
                if (_restaurant.phone.trim().isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: YallaColors.surfaceContainer,
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: Theme.of(context).dividerColor.withValues(alpha: 0.22)),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 42,
                          height: 42,
                          decoration: BoxDecoration(
                            color: YallaColors.primary.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(13),
                          ),
                          child: Icon(Icons.phone_rounded, color: YallaColors.primary, size: 21),
                        ),
                        const SizedBox(width: 11),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'رقم جوال المتجر',
                                style: TextStyle(color: YallaColors.muted, fontSize: 11.5, fontWeight: FontWeight.w700),
                              ),
                              const SizedBox(height: 3),
                              Directionality(
                                textDirection: TextDirection.ltr,
                                child: Text(
                                  _restaurant.phone,
                                  style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900, letterSpacing: 0.6),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        FilledButton.icon(
                          onPressed: _callStore,
                          style: FilledButton.styleFrom(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13)),
                          ),
                          icon: const Icon(Icons.call_rounded, size: 18),
                          label: const Text('اتصال', style: TextStyle(fontWeight: FontWeight.w900)),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      );

  Widget _infoPill(IconData icon, String label, {Color? iconColor}) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 8),
        decoration: BoxDecoration(
          color: YallaColors.surfaceContainer,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 17, color: iconColor ?? YallaColors.primary),
            const SizedBox(width: 5),
            Text(label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
          ],
        ),
      );

  Widget _categoryBar() => Material(
        color: Theme.of(context).scaffoldBackgroundColor,
        elevation: 1,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          itemCount: _menu.length,
          separatorBuilder: (_, __) => const SizedBox(width: 8),
          itemBuilder: (_, index) {
            final selected = index == _selectedSection;
            final section = _menu[index];
            return ChoiceChip(
              selected: selected,
              onSelected: (_) => _scrollToSection(index),
              label: Text('${section.category} (${section.items.length})'),
              labelStyle: TextStyle(fontWeight: FontWeight.w800, color: selected ? Colors.white : null),
              selectedColor: YallaColors.primary,
              showCheckmark: false,
              side: BorderSide.none,
            );
          },
        ),
      );

  Widget _imageFallback() => Container(
        height: 230,
        color: YallaColors.surfaceContainer,
        child: const Center(child: Icon(Icons.storefront, size: 64)),
      );

  Widget _itemTile(MenuItemModel item) {
    final count = _cart.qtyOf(item.id);
    final hasOptions = item.variants.isNotEmpty || item.optionGroups.isNotEmpty;
    return Card(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => _showItemDetails(item),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (item.fullImageUrl != null)
                ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: CachedNetworkImage(
                    imageUrl: item.fullImageUrl!,
                    width: 104,
                    height: 104,
                    fit: BoxFit.cover,
                    placeholder: (_, __) => Container(
                      width: 104,
                      height: 104,
                      color: YallaColors.surfaceContainer,
                    ),
                  ),
                )
              else
                Container(
                  width: 104,
                  height: 104,
                  decoration: BoxDecoration(
                    color: YallaColors.surfaceContainer,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Icon(Icons.fastfood_outlined, size: 34),
                ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            item.name,
                            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900),
                          ),
                        ),
                        if (count > 0)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: YallaColors.primary,
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              '$count',
                              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900),
                            ),
                          ),
                      ],
                    ),
                    if (item.description.isNotEmpty) ...[
                      const SizedBox(height: 5),
                      Text(
                        item.description,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: YallaColors.muted, fontSize: 13, height: 1.35),
                      ),
                    ],
                    const SizedBox(height: 9),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            '${item.price} ₪',
                            style: TextStyle(
                              color: YallaColors.primary,
                              fontSize: 16,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                        if (!item.available)
                          Text('غير متاح', style: TextStyle(color: YallaColors.error, fontWeight: FontWeight.w800))
                        else
                          Material(
                            color: YallaColors.primary,
                            borderRadius: BorderRadius.circular(12),
                            child: InkWell(
                              onTap: () => _quickAddItem(item),
                              borderRadius: BorderRadius.circular(12),
                              child: const SizedBox(
                                width: 38,
                                height: 38,
                                child: Icon(Icons.add_rounded, color: Colors.white),
                              ),
                            ),
                          ),
                      ],
                    ),
                    if (hasOptions) ...[
                      const SizedBox(height: 4),
                      Text('اضغط للتفاصيل والخيارات', style: TextStyle(color: YallaColors.muted, fontSize: 11)),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _cartBar() => SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: FilledButton(
            onPressed: _checkout,
            style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16)),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Badge(label: Text('${_cart.count}')),
                const Text('عرض السلة', style: TextStyle(fontWeight: FontWeight.w900)),
                Text('${_cart.total} ₪', style: const TextStyle(fontWeight: FontWeight.w900)),
              ],
            ),
          ),
        ),
      );
}

class _CategoryHeaderDelegate extends SliverPersistentHeaderDelegate {
  final double height;
  final Widget child;
  const _CategoryHeaderDelegate({required this.height, required this.child});

  @override
  double get minExtent => height;

  @override
  double get maxExtent => height;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) => child;

  @override
  bool shouldRebuild(covariant _CategoryHeaderDelegate oldDelegate) =>
      oldDelegate.height != height || oldDelegate.child != child;
}

class _ItemChoice {
  final MenuVariant? variant;
  final List<SelectedMenuOption> options;
  const _ItemChoice(this.variant, this.options);
}

class _ItemDetailsSheet extends StatefulWidget {
  final MenuItemModel item;
  const _ItemDetailsSheet({required this.item});

  @override
  State<_ItemDetailsSheet> createState() => _ItemDetailsSheetState();
}

class _ItemDetailsSheetState extends State<_ItemDetailsSheet> {
  MenuVariant? _variant;
  final Map<String, Set<String>> _selected = {};
  String _error = '';

  @override
  void initState() {
    super.initState();
    if (widget.item.variants.isNotEmpty) _variant = widget.item.variants.first;
    for (final g in widget.item.optionGroups) {
      _selected[g.name] = <String>{};
    }
  }

  void _toggle(MenuOptionGroup group, MenuOption option) {
    final set = _selected[group.name]!;
    setState(() {
      _error = '';
      if (group.multiple) {
        if (set.contains(option.name)) {
          set.remove(option.name);
        } else if (set.length < group.maxSelect) {
          set.add(option.name);
        }
      } else {
        if (set.contains(option.name) && !group.required && group.minSelect == 0) {
          set.clear();
        } else {
          set
            ..clear()
            ..add(option.name);
        }
      }
    });
  }

  Widget _plusChoiceButton({required bool selected, required VoidCallback onTap}) => Material(
        color: selected ? YallaColors.primary : YallaColors.surfaceContainer,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: SizedBox(
            width: 42,
            height: 42,
            child: Icon(
              selected ? Icons.check_rounded : Icons.add_rounded,
              color: selected ? Colors.white : YallaColors.primary,
              size: 24,
            ),
          ),
        ),
      );

  Widget _variantChoice(MenuVariant variant) {
    final selected = identical(_variant, variant);
    return Container(
      margin: const EdgeInsets.only(top: 8),
      decoration: BoxDecoration(
        color: selected ? YallaColors.primary.withValues(alpha: 0.08) : YallaColors.surfaceContainer,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: selected ? YallaColors.primary.withValues(alpha: 0.5) : Colors.transparent,
        ),
      ),
      child: InkWell(
        onTap: () => setState(() {
          _error = '';
          _variant = variant;
        }),
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            children: [
              _plusChoiceButton(
                selected: selected,
                onTap: () => setState(() {
                  _error = '';
                  _variant = variant;
                }),
              ),
              const SizedBox(width: 12),
              Expanded(child: Text(variant.label, style: const TextStyle(fontWeight: FontWeight.w800))),
              Text('${variant.price} ₪', style: TextStyle(color: YallaColors.muted, fontWeight: FontWeight.w700)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _optionChoice(MenuOptionGroup group, MenuOption option) {
    final selected = (_selected[group.name] ?? {}).contains(option.name);
    return Container(
      margin: const EdgeInsets.only(top: 8),
      decoration: BoxDecoration(
        color: selected ? YallaColors.primary.withValues(alpha: 0.08) : YallaColors.surfaceContainer,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: selected ? YallaColors.primary.withValues(alpha: 0.5) : Colors.transparent,
        ),
      ),
      child: InkWell(
        onTap: () => _toggle(group, option),
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            children: [
              _plusChoiceButton(selected: selected, onTap: () => _toggle(group, option)),
              const SizedBox(width: 12),
              Expanded(child: Text(option.name, style: const TextStyle(fontWeight: FontWeight.w800))),
              if (option.price > 0)
                Text('+${option.price} ₪', style: TextStyle(color: YallaColors.muted, fontWeight: FontWeight.w700)),
            ],
          ),
        ),
      ),
    );
  }

  void _done() {
    if (!widget.item.available) return;
    final result = <SelectedMenuOption>[];
    for (final group in widget.item.optionGroups) {
      final names = _selected[group.name] ?? {};
      final min = group.required ? (group.minSelect < 1 ? 1 : group.minSelect) : group.minSelect;
      if (names.length < min) {
        setState(() => _error = 'اختر ${group.name}');
        return;
      }
      for (final name in names) {
        final option = group.options.firstWhere((e) => e.name == name);
        result.add(SelectedMenuOption(group.name, option.name, option.price));
      }
    }
    Navigator.pop(context, _ItemChoice(_variant, result));
  }

  @override
  Widget build(BuildContext context) {
    final base = _variant?.price ?? widget.item.price;
    num extras = 0;
    for (final group in widget.item.optionGroups) {
      for (final option in group.options) {
        if ((_selected[group.name] ?? {}).contains(option.name)) extras += option.price;
      }
    }

    return DraggableScrollableSheet(
      initialChildSize: widget.item.optionGroups.isEmpty && widget.item.variants.isEmpty ? 0.68 : 0.88,
      minChildSize: 0.48,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, controller) => Material(
        color: Theme.of(context).scaffoldBackgroundColor,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(30)),
        clipBehavior: Clip.antiAlias,
        child: Column(
          children: [
            Expanded(
              child: ListView(
                controller: controller,
                padding: EdgeInsets.zero,
                children: [
                  Stack(
                    children: [
                      if (widget.item.fullImageUrl != null)
                        CachedNetworkImage(
                          imageUrl: widget.item.fullImageUrl!,
                          height: 250,
                          width: double.infinity,
                          fit: BoxFit.cover,
                          placeholder: (_, __) => Container(
                            height: 250,
                            color: YallaColors.surfaceContainer,
                            child: const Center(child: CircularProgressIndicator()),
                          ),
                        )
                      else
                        Container(
                          height: 190,
                          color: YallaColors.surfaceContainer,
                          child: const Center(child: Icon(Icons.fastfood_outlined, size: 70)),
                        ),
                      Positioned(
                        top: 12,
                        left: 12,
                        child: IconButton.filled(
                          style: IconButton.styleFrom(backgroundColor: Colors.white),
                          onPressed: () => Navigator.pop(context),
                          icon: const Icon(Icons.close_rounded, color: Colors.black87),
                        ),
                      ),
                    ],
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(18, 18, 18, 8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(widget.item.name, style: const TextStyle(fontSize: 25, fontWeight: FontWeight.w900)),
                        if (widget.item.description.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          Text(widget.item.description, style: TextStyle(color: YallaColors.muted, height: 1.5)),
                        ],
                        const SizedBox(height: 12),
                        Text(
                          '${base + extras} ₪',
                          style: TextStyle(color: YallaColors.primary, fontSize: 22, fontWeight: FontWeight.w900),
                        ),
                        if (widget.item.variants.isNotEmpty) ...[
                          const SizedBox(height: 20),
                          const Text('الحجم / النوع', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
                          const SizedBox(height: 6),
                          ...widget.item.variants.map(_variantChoice),
                        ],
                        for (final group in widget.item.optionGroups) ...[
                          const SizedBox(height: 18),
                          Text(
                            '${group.name}${group.required ? ' *' : ''}',
                            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            group.multiple ? 'يمكن اختيار حتى ${group.maxSelect}' : 'اختر واحدًا',
                            style: TextStyle(color: YallaColors.muted, fontSize: 12),
                          ),
                          ...group.options.map((o) => _optionChoice(group, o)),
                        ],
                        if (_error.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: Text(_error, style: TextStyle(color: YallaColors.error, fontWeight: FontWeight.w700)),
                          ),
                        const SizedBox(height: 16),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
                child: SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: widget.item.available ? _done : null,
                    style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16)),
                    icon: Icon(widget.item.available ? Icons.add_shopping_cart_rounded : Icons.block_rounded),
                    label: Text(
                      widget.item.available ? 'أضف للسلة · ${base + extras} ₪' : 'الصنف غير متاح حاليًا',
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}