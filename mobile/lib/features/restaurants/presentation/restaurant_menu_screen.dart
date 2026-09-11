// قائمة طعام مطعم (Card 110 + Card 112) — تعرض أصناف المطعم مجمّعة بالأقسام مع
// أزرار إضافة/إنقاص للسلّة، وشريط سفلي للسلّة. الأقسام تظهر كتبويبات مثبّتة أعلى
// الصفحة (sticky): الضغط على قسم ينزل إليه، والتمرير يحرّك التبويب النشط تلقائيًّا.

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

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
  static const double _tabBarHeight = 54;

  late final RestaurantRepository _repo = RestaurantRepository(widget.api);
  late Restaurant _restaurant = widget.restaurant;
  late final Cart _cart = Cart(widget.restaurant);

  final ScrollController _scroll = ScrollController();
  final ScrollController _tabScroll = ScrollController();
  List<GlobalKey> _sectionKeys = [];
  List<GlobalKey> _tabKeys = [];
  int _active = 0;
  bool _lockSpy = false; // نوقف مراقبة التمرير أثناء الانتقال المبرمَج لتفادي التذبذب

  List<MenuSection> _menu = [];
  bool _loading = true;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    _load();
  }

  @override
  void dispose() {
    _scroll.removeListener(_onScroll);
    _scroll.dispose();
    _tabScroll.dispose();
    super.dispose();
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
        _sectionKeys = List.generate(menu.length, (_) => GlobalKey());
        _tabKeys = List.generate(menu.length, (_) => GlobalKey());
        _active = 0;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'تعذّر تحميل القائمة — تحقّق من الاتصال');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // ── التمرير والتبويبات ──────────────────────────────────────────────────

  double _revealOffset(GlobalKey key) {
    final ctx = key.currentContext;
    if (ctx == null) return -1;
    final box = ctx.findRenderObject();
    if (box is! RenderBox) return -1;
    final viewport = RenderAbstractViewport.of(box);
    return viewport.getOffsetToReveal(box, 0).offset;
  }

  void _onScroll() {
    if (_lockSpy || _sectionKeys.isEmpty) return;
    final current = _scroll.offset + _tabBarHeight + 1;
    int active = 0;
    for (var i = 0; i < _sectionKeys.length; i++) {
      final reveal = _revealOffset(_sectionKeys[i]);
      if (reveal >= 0 && current >= reveal) active = i;
    }
    if (active != _active) {
      setState(() => _active = active);
      _syncTab(active);
    }
  }

  Future<void> _scrollToSection(int i) async {
    final reveal = _revealOffset(_sectionKeys[i]);
    if (reveal < 0) return;
    setState(() {
      _active = i;
      _lockSpy = true;
    });
    _syncTab(i);
    final target = (reveal - _tabBarHeight)
        .clamp(0.0, _scroll.position.maxScrollExtent)
        .toDouble();
    await _scroll.animateTo(
      target,
      duration: const Duration(milliseconds: 350),
      curve: Curves.easeInOut,
    );
    if (mounted) _lockSpy = false;
  }

  // نُبقي التبويب النشط ظاهرًا بتحريك الشريط الأفقي وحده.
  //
  // لا نستخدم Scrollable.ensureVisible هنا لأن التبويبات داخل CustomScrollView
  // عمودي؛ ensureVisible يمرّر جميع الـ Scrollables الأب، فيعيد قائمة المطعم
  // إلى أعلى كلما تغيّر القسم النشط أثناء تمرير المستخدم.
  void _syncTab(int i) {
    if (i < 0 || i >= _tabKeys.length || !_tabScroll.hasClients) return;
    final ctx = _tabKeys[i].currentContext;
    final box = ctx?.findRenderObject();
    if (box is! RenderBox) return;

    final viewport = RenderAbstractViewport.of(box);
    final target = viewport
        .getOffsetToReveal(box, 0.5)
        .offset
        .clamp(0.0, _tabScroll.position.maxScrollExtent)
        .toDouble();

    if ((target - _tabScroll.offset).abs() < 1) return;
    _tabScroll.animateTo(
      target,
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeInOut,
    );
  }

  // ── الطلب ───────────────────────────────────────────────────────────────

  Future<void> _checkout() async {
    if (!_restaurant.openNow) {
      _snack('المطعم مغلق حاليًا');
      return;
    }
    if (!_cart.meetsMinOrder) {
      _snack('الحدّ الأدنى للطلب من هذا المطعم ${_restaurant.minOrder} ₪');
      return;
    }
    final placed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => CheckoutScreen(api: widget.api, cart: _cart)),
    );
    if (!mounted) return;
    if (placed == true) {
      Navigator.of(context).pop();
    } else {
      setState(() {});
    }
  }

  void _snack(String text) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_restaurant.name)),
      body: _body(),
      bottomNavigationBar: _cart.isEmpty ? null : _cartBar(),
    );
  }

  Widget _body() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error.isNotEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: _load, child: const Text('إعادة المحاولة')),
          ],
        ),
      );
    }

    return CustomScrollView(
      controller: _scroll,
      slivers: [
        SliverToBoxAdapter(child: _header()),
        if (_menu.length > 1)
          SliverPersistentHeader(
            pinned: true,
            delegate: _TabBarDelegate(
              height: _tabBarHeight,
              child: _tabBar(),
            ),
          ),
        if (_menu.isEmpty)
          const SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.only(top: 40),
              child: Center(child: Text('لا توجد أصناف في هذه القائمة بعد')),
            ),
          ),
        for (var i = 0; i < _menu.length; i++) _sectionSliver(i),
        const SliverToBoxAdapter(child: SizedBox(height: 24)),
      ],
    );
  }

  // ترويسة المطعم: صورة غلاف أطول + الموعد + الحالة + معلومات سريعة
  Widget _header() {
    final open = _restaurant.openNow;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          height: 200,
          width: double.infinity,
          child: _restaurant.fullImageUrl != null
              ? Image.network(
                  _restaurant.fullImageUrl!,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => _imageFallback(),
                )
              : _imageFallback(),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // الموعد + حالة الفتح
              Row(
                children: [
                  _statusPill(open),
                  if (_restaurant.scheduleLabel.isNotEmpty) ...[
                    const SizedBox(width: 8),
                    Icon(Icons.access_time, size: 16, color: YallaColors.muted),
                    const SizedBox(width: 4),
                    Text(
                      _restaurant.scheduleLabel,
                      style: TextStyle(color: YallaColors.muted, fontWeight: FontWeight.w600),
                    ),
                  ],
                ],
              ),
              if (!open && _restaurant.opensAtLabel.isNotEmpty) ...[
                const SizedBox(height: 8),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: YallaColors.errorContainer,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.info_outline, color: YallaColors.error, size: 20),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text('المطعم مغلق حاليًا — ${_restaurant.opensAtLabel}'),
                      ),
                    ],
                  ),
                ),
              ],
              if (_restaurant.description.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(_restaurant.description, style: TextStyle(color: YallaColors.muted)),
              ],
              const SizedBox(height: 8),
              Wrap(
                spacing: 14,
                runSpacing: 6,
                children: [
                  if (_restaurant.address.isNotEmpty)
                    _meta(Icons.place_outlined, _restaurant.address),
                  if (_restaurant.prepMinutes > 0)
                    _meta(Icons.timer_outlined, '~${_restaurant.prepMinutes} دقيقة تحضير'),
                  if (_restaurant.minOrder > 0)
                    _meta(Icons.shopping_basket_outlined,
                        'الحدّ الأدنى ${_restaurant.minOrder} ₪'),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _statusPill(bool open) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: open ? YallaColors.successContainer : YallaColors.errorContainer,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                color: open ? YallaColors.success : YallaColors.error,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 6),
            Text(
              open ? 'مفتوح الآن' : 'مغلق',
              style: TextStyle(
                color: open ? YallaColors.success : YallaColors.error,
                fontWeight: FontWeight.bold,
                fontSize: 13,
              ),
            ),
          ],
        ),
      );

  // شريط التبويبات المثبّت — يبني رقائق الأقسام
  Widget _tabBar() => Container(
        height: _tabBarHeight,
        color: Theme.of(context).scaffoldBackgroundColor,
        alignment: Alignment.centerRight,
        child: ListView.separated(
          controller: _tabScroll,
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          itemCount: _menu.length,
          separatorBuilder: (_, __) => const SizedBox(width: 8),
          itemBuilder: (_, i) {
            final selected = i == _active;
            final section = _menu[i];
            return ChoiceChip(
              key: _tabKeys[i],
              label: Text('${section.category} (${section.items.length})'),
              selected: selected,
              onSelected: (_) => _scrollToSection(i),
            );
          },
        ),
      );

  Widget _sectionSliver(int i) {
    final section = _menu[i];
    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              key: _sectionKeys[i],
              padding: const EdgeInsets.only(top: 16, bottom: 8),
              child: Text(
                '${section.category} (${section.items.length})',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
            ),
            ...section.items.map(_menuTile),
          ],
        ),
      ),
    );
  }

  Widget _menuTile(MenuItemModel item) {
    final qty = _cart.qtyOf(item.id);
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Opacity(
        opacity: item.available ? 1.0 : 0.5,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              if (item.fullImageUrl != null) ...[
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Image.network(
                    item.fullImageUrl!,
                    width: 92,
                    height: 92,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => _tileImageFallback(),
                  ),
                ),
                const SizedBox(width: 12),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(item.name,
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                    if (item.description.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        item.description,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: YallaColors.muted, fontSize: 12),
                      ),
                    ],
                    const SizedBox(height: 6),
                    Text(
                      item.available ? '${item.price} ₪' : 'غير متوفّر حاليًا',
                      style: TextStyle(
                        color: item.available ? YallaColors.primary : YallaColors.error,
                        fontWeight: FontWeight.bold,
                        fontSize: 15,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              if (item.available)
                qty == 0
                    ? IconButton.filled(
                        onPressed: () => setState(() => _cart.add(item)),
                        icon: const Icon(Icons.add),
                        tooltip: 'إضافة للسلّة',
                      )
                    : Row(
                        children: [
                          IconButton(
                            onPressed: () => setState(() => _cart.remove(item)),
                            icon: const Icon(Icons.remove_circle_outline),
                          ),
                          Text('$qty', style: const TextStyle(fontWeight: FontWeight.bold)),
                          IconButton(
                            onPressed: () => setState(() => _cart.add(item)),
                            icon: Icon(Icons.add_circle, color: YallaColors.primary),
                          ),
                        ],
                      ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _cartBar() => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: FilledButton(
            onPressed: _checkout,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('${_cart.count} صنف · ${_cart.total} ₪'),
                const Row(
                  children: [
                    Text('إتمام الطلب'),
                    SizedBox(width: 4),
                    Icon(Icons.arrow_back, size: 18),
                  ],
                ),
              ],
            ),
          ),
        ),
      );

  Widget _imageFallback() => Container(
        color: YallaColors.primaryContainer,
        alignment: Alignment.center,
        child: Icon(Icons.restaurant, size: 44, color: YallaColors.primaryDeep),
      );

  Widget _tileImageFallback() => Container(
        width: 92,
        height: 92,
        color: YallaColors.primaryContainer,
        alignment: Alignment.center,
        child: Icon(Icons.restaurant_menu, size: 28, color: YallaColors.primaryDeep),
      );

  Widget _meta(IconData icon, String text) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: YallaColors.muted),
          const SizedBox(width: 4),
          Text(text, style: TextStyle(color: YallaColors.muted, fontSize: 12)),
        ],
      );
}

// مندوب الشريط المثبّت للأقسام
class _TabBarDelegate extends SliverPersistentHeaderDelegate {
  final double height;
  final Widget child;
  const _TabBarDelegate({required this.height, required this.child});

  @override
  double get minExtent => height;
  @override
  double get maxExtent => height;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    return Material(
      color: Theme.of(context).scaffoldBackgroundColor,
      elevation: overlapsContent ? 2 : 0,
      child: child,
    );
  }

  @override
  bool shouldRebuild(_TabBarDelegate oldDelegate) =>
      oldDelegate.child != child || oldDelegate.height != height;
}
