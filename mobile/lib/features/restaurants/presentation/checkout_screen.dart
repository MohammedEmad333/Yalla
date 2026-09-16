import 'package:flutter/material.dart';

import '../../../core/data/gaza_neighborhoods.dart';
import '../../../core/network/api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../data/restaurant_repository.dart';

class CheckoutScreen extends StatefulWidget {
  final ApiClient api;
  final Cart cart;
  const CheckoutScreen({super.key, required this.api, required this.cart});

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  late final RestaurantRepository _repo = RestaurantRepository(widget.api);

  String? _city;
  String? _neighborhood;
  final _street = TextEditingController();
  final _details = TextEditingController();
  final _addressNote = TextEditingController();
  final _orderNote = TextEditingController();
  final _coupon = TextEditingController();

  List<dynamic> _savedAddresses = [];
  Map<String, dynamic>? _saved;
  bool _loadingAddresses = true;
  bool _submitting = false;
  bool _loadingQuote = false;
  bool _checkingCoupon = false;
  num? _deliveryPrice;
  num? _deliveryOriginal;
  bool _offerApplied = false;
  num? _etaMinutes;
  num _discount = 0;
  String _couponMessage = '';

  Cart get _cart => widget.cart;

  @override
  void initState() {
    super.initState();
    _loadAddresses();
  }

  @override
  void dispose() {
    _street.dispose();
    _details.dispose();
    _addressNote.dispose();
    _orderNote.dispose();
    _coupon.dispose();
    super.dispose();
  }

  Future<void> _loadAddresses() async {
    try {
      final data = await widget.api.get('/features/addresses');
      if (mounted) setState(() => _savedAddresses = data as List);
    } catch (_) {
      // العناوين المحفوظة تحسين اختياري؛ يبقى الإدخال اليدوي متاحًا.
    } finally {
      if (mounted) setState(() => _loadingAddresses = false);
    }
  }

  List<double>? get _manualDropoffCoords => coordsOf(_city, _neighborhood);

  List<double>? get _dropoffCoords {
    final raw = _saved?['location']?['coordinates'];
    if (raw is List && raw.length == 2) {
      return raw.map((e) => (e as num).toDouble()).toList(growable: false);
    }
    return _manualDropoffCoords;
  }

  List<double>? get _pickupCoords {
    final byNeighborhood = coordsOf(_cart.restaurant.city, _cart.restaurant.neighborhood);
    if (byNeighborhood != null) return byNeighborhood;
    final stored = _cart.restaurant.coords;
    if (stored == null || stored.length != 2) return null;
    return stored;
  }

  Map<String, dynamic>? get _dropoffPayload {
    final coords = _dropoffCoords;
    if (coords == null) return null;
    if (_saved != null) {
      return {
        'address': (_saved!['address'] ?? '').toString(),
        'details': (_saved!['label'] ?? '').toString(),
        'location': {'type': 'Point', 'coordinates': coords},
      };
    }
    if (_city == null || _neighborhood == null) return null;
    return {
      'city': _city,
      'neighborhood': _neighborhood,
      'street': _street.text.trim(),
      'details': _details.text.trim(),
      'note': _addressNote.text.trim(),
      'location': {'type': 'Point', 'coordinates': coords},
    };
  }

  Future<void> _refreshQuote() async {
    final pickup = _pickupCoords;
    final dropoff = _dropoffCoords;
    if (pickup == null || dropoff == null) return;
    setState(() => _loadingQuote = true);
    try {
      final q = await _repo.deliveryQuote(pickup, dropoff);
      if (!mounted) return;
      setState(() {
        _deliveryPrice = q['price'] as num?;
        _deliveryOriginal = q['originalPrice'] as num?;
        _offerApplied = q['offerApplied'] == true;
        _etaMinutes = ((q['etaMinutes'] as num?) ?? 0) + _cart.restaurant.prepMinutes;
      });
    } finally {
      if (mounted) setState(() => _loadingQuote = false);
    }
  }

  Future<void> _validateCoupon() async {
    final code = _coupon.text.trim();
    if (code.isEmpty) {
      setState(() {
        _discount = 0;
        _couponMessage = '';
      });
      return;
    }
    setState(() => _checkingCoupon = true);
    try {
      final raw = await widget.api.post('/features/coupons/validate', {
        'code': code,
        'subtotal': _cart.total,
        'restaurantId': _cart.restaurant.id,
      });
      final data = Map<String, dynamic>.from(raw as Map);
      if (!mounted) return;
      setState(() {
        _discount = (data['discount'] as num?) ?? 0;
        _couponMessage = 'تم تطبيق الكوبون: خصم $_discount ₪';
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _discount = 0;
        _couponMessage = e.message;
      });
    } finally {
      if (mounted) setState(() => _checkingCoupon = false);
    }
  }

  Future<void> _submit() async {
    final dropoff = _dropoffPayload;
    if (dropoff == null) {
      _snack('اختر عنوانًا محفوظًا أو مدينة وحي التسليم');
      return;
    }
    if (_cart.isEmpty) {
      _snack('السلّة فارغة');
      return;
    }
    setState(() => _submitting = true);
    try {
      await widget.api.post('/commerce/restaurant-order', {
        'restaurantId': _cart.restaurant.id,
        'items': _cart.toItemsPayload(),
        'dropoff': dropoff,
        if (_orderNote.text.trim().isNotEmpty) 'note': _orderNote.text.trim(),
        if (_coupon.text.trim().isNotEmpty) 'couponCode': _coupon.text.trim(),
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم إرسال طلبك للمطعم — تابعه من "طلباتي"')),
      );
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      final message = e.message == 'الرصيد غير كافٍ'
          ? 'رصيد محفظتك غير كافٍ لإتمام الطلب — اشحن المحفظة ثم حاول مرة أخرى'
          : e.message;
      if (mounted) _snack(message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _snack(String text) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));

  @override
  Widget build(BuildContext context) {
    final itemsAfterDiscount = (_cart.total - _discount).clamp(0, double.infinity);
    final total = itemsAfterDiscount + (_deliveryPrice ?? 0);

    return Scaffold(
      appBar: AppBar(title: const Text('إتمام الطلب')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _section('طلبك من ${_cart.restaurant.name}', Icons.storefront),
          const SizedBox(height: 8),
          ..._cart.lines.values.map(_cartLine),
          const SizedBox(height: 20),

          _section('عنوان التسليم', Icons.location_on_outlined),
          const SizedBox(height: 8),
          if (_loadingAddresses)
            const LinearProgressIndicator()
          else if (_savedAddresses.isNotEmpty)
            DropdownButtonFormField<Map<String, dynamic>?>(
              value: _saved,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: 'عنوان محفوظ (اختياري)',
                prefixIcon: Icon(Icons.bookmark_outline),
                border: OutlineInputBorder(),
              ),
              items: [
                const DropdownMenuItem<Map<String, dynamic>?>(value: null, child: Text('إدخال عنوان جديد')),
                ..._savedAddresses.map((raw) {
                  final a = Map<String, dynamic>.from(raw as Map);
                  return DropdownMenuItem<Map<String, dynamic>?>(
                    value: a,
                    child: Text('${a['label'] ?? 'عنوان'} — ${a['address'] ?? ''}', overflow: TextOverflow.ellipsis),
                  );
                }),
              ],
              onChanged: (v) {
                setState(() {
                  _saved = v;
                  _deliveryPrice = null;
                });
                if (v != null) _refreshQuote();
              },
            ),
          if (_saved == null) ...[
            if (_savedAddresses.isNotEmpty) const SizedBox(height: 10),
            _cityPicker(),
            const SizedBox(height: 8),
            _neighborhoodPicker(),
            const SizedBox(height: 8),
            TextField(controller: _street, decoration: const InputDecoration(labelText: 'الشارع', prefixIcon: Icon(Icons.add_road), border: OutlineInputBorder())),
            const SizedBox(height: 8),
            TextField(controller: _details, decoration: const InputDecoration(labelText: 'العنوان بالتفصيل', prefixIcon: Icon(Icons.home_outlined), border: OutlineInputBorder())),
            const SizedBox(height: 8),
            TextField(controller: _addressNote, decoration: const InputDecoration(labelText: 'ملاحظة على العنوان', prefixIcon: Icon(Icons.note_alt_outlined), border: OutlineInputBorder())),
          ],
          const SizedBox(height: 20),

          _section('كوبون الخصم', Icons.local_offer_outlined),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: TextField(
              controller: _coupon,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(labelText: 'أدخل رمز الكوبون', border: OutlineInputBorder()),
            )),
            const SizedBox(width: 8),
            FilledButton.tonal(
              onPressed: _checkingCoupon ? null : _validateCoupon,
              child: _checkingCoupon
                  ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('تطبيق'),
            ),
          ]),
          if (_couponMessage.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(_couponMessage, style: TextStyle(color: _discount > 0 ? YallaColors.success : YallaColors.error)),
          ],
          const SizedBox(height: 20),

          _section('ملاحظة للمطعم', Icons.chat_bubble_outline),
          const SizedBox(height: 8),
          TextField(controller: _orderNote, decoration: const InputDecoration(labelText: 'مثال: بلا بصل، صلصة زيادة', border: OutlineInputBorder())),
          const SizedBox(height: 20),

          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(children: [
                _summary('قيمة الأصناف', '${_cart.total} ₪'),
                if (_discount > 0) ...[
                  const SizedBox(height: 8),
                  _summary('خصم الكوبون', '-$_discount ₪', accent: true),
                ],
                const SizedBox(height: 8),
                _deliveryRow(),
                const Divider(height: 22),
                _summary('المجموع التقريبي', '$total ₪', bold: true),
                if (_etaMinutes != null) ...[
                  const SizedBox(height: 8),
                  Text('الزمن المتوقع: ~$_etaMinutes دقيقة', style: TextStyle(color: YallaColors.muted, fontSize: 12)),
                ],
              ]),
            ),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: _submitting ? null : _submit,
            icon: _submitting
                ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.send),
            label: const Text('تأكيد الطلب'),
          ),
        ],
      ),
    );
  }

  Widget _cartLine(CartLine line) => Card(
        margin: const EdgeInsets.only(bottom: 8),
        child: ListTile(
          title: Text(line.label),
          subtitle: Text('${line.unitPrice} ₪ للوحدة'),
          trailing: Row(mainAxisSize: MainAxisSize.min, children: [
            IconButton(onPressed: () {
              setState(() => _cart.remove(line.item));
              if (_cart.isEmpty) Navigator.of(context).pop(false);
            }, icon: const Icon(Icons.remove_circle_outline)),
            Text('${line.qty}', style: const TextStyle(fontWeight: FontWeight.bold)),
            IconButton(
              onPressed: () => setState(() => _cart.add(line.item, variant: line.variant)),
              icon: Icon(Icons.add_circle, color: YallaColors.primary),
            ),
          ]),
        ),
      );

  Widget _deliveryRow() {
    if (_loadingQuote) return _summary('أجرة التوصيل', 'جارٍ الحساب...');
    if (_deliveryPrice == null) return _summary('أجرة التوصيل', 'اختر عنوان التسليم');
    if (_offerApplied && _deliveryOriginal != null) {
      return Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        const Text('أجرة التوصيل'),
        Row(children: [
          Text('$_deliveryOriginal ₪', style: TextStyle(decoration: TextDecoration.lineThrough, color: YallaColors.muted)),
          const SizedBox(width: 8),
          Text('$_deliveryPrice ₪', style: TextStyle(fontWeight: FontWeight.bold, color: YallaColors.primary)),
        ]),
      ]);
    }
    return _summary('أجرة التوصيل', '$_deliveryPrice ₪');
  }

  Widget _summary(String label, String value, {bool bold = false, bool accent = false}) =>
      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Text(label, style: TextStyle(fontWeight: bold ? FontWeight.bold : FontWeight.normal)),
        Text(value, style: TextStyle(fontWeight: bold ? FontWeight.bold : FontWeight.normal, color: (bold || accent) ? YallaColors.primary : null)),
      ]);

  Widget _cityPicker() => DropdownButtonFormField<String>(
        value: _city,
        isExpanded: true,
        decoration: const InputDecoration(labelText: 'المدينة', prefixIcon: Icon(Icons.location_city), border: OutlineInputBorder()),
        items: gazaCities.map((n) => DropdownMenuItem(value: n, child: Text(n))).toList(),
        onChanged: (v) => setState(() {
          _city = v;
          _neighborhood = null;
          _deliveryPrice = null;
        }),
      );

  Widget _neighborhoodPicker() => DropdownButtonFormField<String>(
        value: _neighborhood,
        isExpanded: true,
        decoration: InputDecoration(
          labelText: 'الحي',
          prefixIcon: const Icon(Icons.holiday_village_outlined),
          border: const OutlineInputBorder(),
          hintText: _city == null ? 'اختر المدينة أولًا' : null,
        ),
        items: neighborhoodsOf(_city).map((n) => DropdownMenuItem(value: n, child: Text(n))).toList(),
        onChanged: _city == null ? null : (v) {
          setState(() => _neighborhood = v);
          _refreshQuote();
        },
      );

  Widget _section(String text, IconData icon) => Row(children: [
        Icon(icon, size: 20),
        const SizedBox(width: 8),
        Expanded(child: Text(text, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold))),
      ]);
}
