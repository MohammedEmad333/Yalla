// قائمة طعام مطعم (Card 110) — تعرض أصناف المطعم مجمّعة بالأقسام مع أزرار
// إضافة/إنقاص للسلّة، وشريط سفلي يعرض عدد القطع وقيمتها وزرّ "إتمام الطلب".

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
      if (mounted) setState(() => _error = 'تعذّر تحميل القائمة — تحقّق من الاتصال');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // الانتقال لإتمام الطلب — نُعيد نتيجة "تم" للأعلى لإغلاق الشاشة بعد النجاح
  Future<void> _checkout() async {
    if (!_restaurant.isOpen) {
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
    // نجح الطلب → نغلق القائمة ونعود لصفحة المطاعم؛ وإلّا نحدّث شريط السلّة
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

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      children: [
        _header(),
        const SizedBox(height: 16),
        if (_menu.isEmpty)
          const Padding(
            padding: EdgeInsets.only(top: 40),
            child: Center(child: Text('لا توجد أصناف في هذه القائمة بعد')),
          ),
        for (final section in _menu) ...[
          Padding(
            padding: const EdgeInsets.only(bottom: 8, top: 8),
            child: Text(
              section.category,
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
            ),
          ),
          ...section.items.map(_menuTile),
        ],
      ],
    );
  }

  // ترويسة المطعم: صورة + وصف + معلومات سريعة + تنبيه الإغلاق
  Widget _header() => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: SizedBox(
              height: 150,
              width: double.infinity,
              child: _restaurant.fullImageUrl != null
                  ? Image.network(
                      _restaurant.fullImageUrl!,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => _imageFallback(),
                    )
                  : _imageFallback(),
            ),
          ),
          if (!_restaurant.isOpen)
            Container(
              margin: const EdgeInsets.only(top: 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: YallaColors.errorContainer,
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Row(
                children: [
                  Icon(Icons.info_outline, color: YallaColors.error),
                  SizedBox(width: 8),
                  Expanded(child: Text('المطعم مغلق حاليًا — لا يمكن إتمام الطلب الآن')),
                ],
              ),
            ),
          if (_restaurant.description.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(_restaurant.description, style: const TextStyle(color: YallaColors.muted)),
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
                _meta(Icons.shopping_basket_outlined, 'الحدّ الأدنى ${_restaurant.minOrder} ₪'),
            ],
          ),
        ],
      );

  Widget _menuTile(MenuItemModel item) {
    final qty = _cart.qtyOf(item.id);
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Opacity(
        opacity: item.available ? 1.0 : 0.5,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              if (item.fullImageUrl != null) ...[
                ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: Image.network(
                    item.fullImageUrl!,
                    width: 60,
                    height: 60,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                  ),
                ),
                const SizedBox(width: 12),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(item.name, style: const TextStyle(fontWeight: FontWeight.bold)),
                    if (item.description.isNotEmpty)
                      Text(
                        item.description,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: YallaColors.muted, fontSize: 12),
                      ),
                    const SizedBox(height: 4),
                    Text(
                      item.available ? '${item.price} ₪' : 'غير متوفّر حاليًا',
                      style: TextStyle(
                        color: item.available ? YallaColors.primary : YallaColors.error,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
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
                            icon: const Icon(Icons.add_circle, color: YallaColors.primary),
                          ),
                        ],
                      ),
            ],
          ),
        ),
      ),
    );
  }

  // شريط السلّة السفلي — يظهر فور إضافة أوّل صنف
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
        child: const Icon(Icons.restaurant, size: 44, color: YallaColors.primaryDeep),
      );

  Widget _meta(IconData icon, String text) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: YallaColors.muted),
          const SizedBox(width: 4),
          Text(text, style: const TextStyle(color: YallaColors.muted, fontSize: 12)),
        ],
      );
}
