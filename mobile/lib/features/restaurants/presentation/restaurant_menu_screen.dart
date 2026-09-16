import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../core/network/api_client.dart';
import '../../../core/theme/app_theme.dart';
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
  late final RestaurantRepository _repo = RestaurantRepository(widget.api);
  late Restaurant _restaurant = widget.restaurant;
  late final Cart _cart = Cart(widget.restaurant);
  List<MenuSection> _menu = [];
  bool _loading = true;
  bool _rating = false;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final (restaurant, menu) = await _repo.getWithMenu(widget.restaurant.id);
      if (!mounted) return;
      setState(() {
        _restaurant = restaurant;
        _menu = menu;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'تعذّر تحميل القائمة');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _addConfigured(MenuItemModel item) async {
    if (!item.available) return;
    if (item.variants.isEmpty && item.optionGroups.isEmpty) {
      setState(() => _cart.add(item));
      return;
    }
    final choice = await showModalBottomSheet<_ItemChoice>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _ItemOptionsSheet(item: item),
    );
    if (choice == null || !mounted) return;
    setState(() => _cart.add(item, variant: choice.variant, options: choice.options));
  }

  Future<void> _checkout() async {
    if (!_restaurant.openNow) {
      _snack('المتجر مغلق حاليًا');
      return;
    }
    if (!_cart.meetsMinOrder) {
      _snack('الحد الأدنى للطلب ${_restaurant.minOrder} ₪');
      return;
    }
    final placed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => CheckoutScreen(api: widget.api, cart: _cart)),
    );
    if (!mounted) return;
    if (placed == true) Navigator.of(context).pop();
    setState(() {});
  }

  Future<void> _rate() async {
    final stars = await showDialog<int>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('قيّم المتجر'),
        content: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(5, (i) => IconButton(
            onPressed: () => Navigator.pop(ctx, i + 1),
            icon: const Icon(Icons.star_rounded, color: Color(0xFFFFB300), size: 34),
          )),
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

  void _snack(String text) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(_restaurant.name)),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error.isNotEmpty
                ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Text(_error),
                    const SizedBox(height: 12),
                    FilledButton(onPressed: _load, child: const Text('إعادة المحاولة')),
                  ]))
                : RefreshIndicator(onRefresh: _load, child: _content()),
        bottomNavigationBar: _cart.isEmpty ? null : _cartBar(),
      );

  Widget _content() => ListView(
        padding: const EdgeInsets.only(bottom: 120),
        children: [
          if (_restaurant.fullImageUrl != null)
            CachedNetworkImage(
              imageUrl: _restaurant.fullImageUrl!,
              height: 210,
              width: double.infinity,
              fit: BoxFit.cover,
              placeholder: (_, __) => const SizedBox(height: 210, child: Center(child: CircularProgressIndicator())),
              errorWidget: (_, __, ___) => _imageFallback(),
            )
          else
            _imageFallback(),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text(_restaurant.name, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900))),
                FilledButton.tonalIcon(
                  onPressed: _rating ? null : _rate,
                  icon: const Icon(Icons.star_outline),
                  label: const Text('تقييم'),
                ),
              ]),
              const SizedBox(height: 6),
              Text(
                _restaurant.ratingCount > 0
                    ? '⭐ ${_restaurant.ratingAverage.toStringAsFixed(1)} (${_restaurant.ratingCount})'
                    : 'لا توجد تقييمات بعد',
                style: TextStyle(color: YallaColors.muted),
              ),
              if (_restaurant.description.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(_restaurant.description),
              ],
              const SizedBox(height: 8),
              Wrap(spacing: 12, runSpacing: 8, children: [
                Chip(label: Text(_restaurant.openNow ? 'مفتوح الآن' : 'مغلق')),
                if (_restaurant.scheduleLabel.isNotEmpty) Chip(label: Text(_restaurant.scheduleLabel)),
                if (_restaurant.prepMinutes > 0) Chip(label: Text('تحضير ~${_restaurant.prepMinutes} دقيقة')),
                if (_restaurant.minOrder > 0) Chip(label: Text('حد أدنى ${_restaurant.minOrder} ₪')),
              ]),
            ]),
          ),
          if (_menu.isEmpty)
            const Padding(padding: EdgeInsets.all(36), child: Center(child: Text('لا توجد أصناف بعد'))),
          for (final section in _menu) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 18, 16, 8),
              child: Text(section.category, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w900)),
            ),
            ...section.items.map(_itemTile),
          ],
        ],
      );

  Widget _imageFallback() => Container(
        height: 210,
        color: YallaColors.surfaceContainer,
        child: const Center(child: Icon(Icons.storefront, size: 64)),
      );

  Widget _itemTile(MenuItemModel item) {
    final count = _cart.qtyOf(item.id);
    final hasOptions = item.variants.isNotEmpty || item.optionGroups.isNotEmpty;
    return Card(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 10),
      child: InkWell(
        onTap: item.available ? () => _addConfigured(item) : null,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (item.fullImageUrl != null)
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: CachedNetworkImage(imageUrl: item.fullImageUrl!, width: 82, height: 82, fit: BoxFit.cover),
              )
            else
              Container(width: 82, height: 82, decoration: BoxDecoration(color: YallaColors.surfaceContainer, borderRadius: BorderRadius.circular(12)), child: const Icon(Icons.fastfood_outlined)),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(item.name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
              if (item.description.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(item.description, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(color: YallaColors.muted, fontSize: 13)),
              ],
              const SizedBox(height: 8),
              Text('من ${item.price} ₪', style: TextStyle(color: YallaColors.primary, fontWeight: FontWeight.w900)),
              if (hasOptions) Text('يتوفر بخيارات وإضافات', style: TextStyle(color: YallaColors.muted, fontSize: 12)),
            ])),
            const SizedBox(width: 8),
            Column(children: [
              IconButton.filledTonal(onPressed: item.available ? () => _addConfigured(item) : null, icon: const Icon(Icons.add)),
              if (count > 0) Text('$count', style: const TextStyle(fontWeight: FontWeight.bold)),
            ]),
          ]),
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
            style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 15)),
            child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Badge(label: Text('${_cart.count}')),
              const Text('عرض السلة'),
              Text('${_cart.total} ₪'),
            ]),
          ),
        ),
      );
}

class _ItemChoice {
  final MenuVariant? variant;
  final List<SelectedMenuOption> options;
  const _ItemChoice(this.variant, this.options);
}

class _ItemOptionsSheet extends StatefulWidget {
  final MenuItemModel item;
  const _ItemOptionsSheet({required this.item});
  @override
  State<_ItemOptionsSheet> createState() => _ItemOptionsSheetState();
}

class _ItemOptionsSheetState extends State<_ItemOptionsSheet> {
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
        set
          ..clear()
          ..add(option.name);
      }
    });
  }

  void _done() {
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
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 20),
      child: SingleChildScrollView(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(widget.item.name, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
          const SizedBox(height: 14),
          if (widget.item.variants.isNotEmpty) ...[
            const Text('الحجم / النوع', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 6),
            ...widget.item.variants.map((v) => RadioListTile<MenuVariant>(
              value: v,
              groupValue: _variant,
              onChanged: (x) => setState(() => _variant = x),
              title: Text(v.label),
              secondary: Text('${v.price} ₪'),
            )),
          ],
          for (final group in widget.item.optionGroups) ...[
            const SizedBox(height: 12),
            Text('${group.name}${group.required ? ' *' : ''}', style: const TextStyle(fontWeight: FontWeight.bold)),
            Text(group.multiple ? 'يمكن اختيار حتى ${group.maxSelect}' : 'اختر واحدًا', style: TextStyle(color: YallaColors.muted, fontSize: 12)),
            ...group.options.map((o) => CheckboxListTile(
              value: (_selected[group.name] ?? {}).contains(o.name),
              onChanged: (_) => _toggle(group, o),
              title: Text(o.name),
              secondary: o.price > 0 ? Text('+${o.price} ₪') : null,
            )),
          ],
          if (_error.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error, style: TextStyle(color: YallaColors.error))),
          const SizedBox(height: 14),
          FilledButton(onPressed: _done, child: Text('إضافة للسلة · ${base + extras} ₪')),
        ]),
      ),
    );
  }
}
