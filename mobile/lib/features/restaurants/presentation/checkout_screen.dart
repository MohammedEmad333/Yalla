// إتمام طلب المطعم (Card 110) — مراجعة السلّة، إدخال عنوان التسليم (المدينة ثمّ
// الحي كما في طلب التوصيل)، عرض أجرة التوصيل التقديرية والمجموع، ثمّ تأكيد الطلب.
// الطلب الناتج طلب توصيل عادي يظهر في "طلباتي" ويُسنَد لكابتن كالمعتاد.

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

  // عنوان التسليم
  String? _city;
  String? _neighborhood;
  final _street = TextEditingController();
  final _details = TextEditingController();
  final _addressNote = TextEditingController();

  // ملاحظة الزبون للمطعم (بلا بصل، حارّ...)
  final _orderNote = TextEditingController();

  bool _submitting = false;
  bool _loadingQuote = false;
  num? _deliveryPrice; // أجرة التوصيل التقديرية
  num? _deliveryOriginal; // Card 89: السعر قبل العرض (يُعرض مشطوبًا)
  bool _offerApplied = false;
  num? _etaMinutes;

  Cart get _cart => widget.cart;
  List<double>? get _dropoffCoords => coordsOf(_city, _neighborhood);

  // المدينة والحي هما مصدر موقع المطعم. نرجع للإحداثيّات القادمة من الخادم فقط
  // إذا كان الحي غير موجود في القائمة، دعمًا للسجلات/المناطق المخصّصة.
  List<double>? get _pickupCoords {
    final fromNeighborhood = coordsOf(
      _cart.restaurant.city,
      _cart.restaurant.neighborhood,
    );
    if (fromNeighborhood != null) return fromNeighborhood;

    final stored = _cart.restaurant.coords;
    if (stored == null || stored.length != 2) return null;
    final lng = stored[0], lat = stored[1];
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
    return stored;
  }

  // تسعيرة التوصيل من المطعم إلى عنوان الزبون
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
        _etaMinutes = q['etaMinutes'] as num?;
      });
    } on ApiException {
      // نتجاهل خطأ التسعيرة — السعر النهائي يُحسب في الخادم عند الإنشاء
    } finally {
      if (mounted) setState(() => _loadingQuote = false);
    }
  }

  Future<void> _submit() async {
    if (_city == null || _neighborhood == null) {
      _snack('اختر مدينة وحي التسليم');
      return;
    }
    if (_cart.isEmpty) {
      _snack('السلّة فارغة');
      return;
    }
    setState(() => _submitting = true);
    try {
      await _repo.placeOrder(
        cart: _cart,
        dropoff: {
          'city': _city,
          'neighborhood': _neighborhood,
          'street': _street.text.trim(),
          'details': _details.text.trim(),
          'note': _addressNote.text.trim(),
          if (_dropoffCoords != null)
            'location': {'type': 'Point', 'coordinates': _dropoffCoords},
        },
        note: _orderNote.text,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم إرسال طلبك للمطعم — تابعه من "طلباتي"')),
      );
      Navigator.of(context).pop(true); // نُعلم شاشة القائمة بنجاح الطلب
    } on ApiException catch (e) {
      // نحافظ على رسالة الخادم الدقيقة؛ ونوحّد أخطاء الرصيد القديمة إن أعادها
      // خادم لم يُحدَّث بعد بصيغة مختصرة.
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
    final total = _cart.total + (_deliveryPrice ?? 0);

    return Scaffold(
      appBar: AppBar(title: const Text('إتمام الطلب')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _sectionLabel(_cart.restaurant.name, Icons.storefront),
          const SizedBox(height: 8),
          ..._cart.lines.values.map(_cartLineTile),
          const SizedBox(height: 20),

          _sectionLabel('عنوان التسليم', Icons.flag),
          const SizedBox(height: 8),
          _cityPicker(),
          const SizedBox(height: 8),
          _neighborhoodPicker(),
          const SizedBox(height: 8),
          TextField(
            controller: _street,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(
              labelText: 'الشارع',
              prefixIcon: Icon(Icons.add_road),
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _details,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(
              labelText: 'العنوان بالتفاصيل',
              hintText: 'مبنى، طابق، علامة مميّزة',
              prefixIcon: Icon(Icons.edit_location_alt),
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _addressNote,
            decoration: const InputDecoration(
              labelText: 'ملاحظة على العنوان (اختياري)',
              prefixIcon: Icon(Icons.note_alt_outlined),
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 20),

          _sectionLabel('ملاحظة للمطعم', Icons.chat_bubble_outline),
          const SizedBox(height: 8),
          TextField(
            controller: _orderNote,
            decoration: const InputDecoration(
              labelText: 'مثال: بلا بصل، صلصة زيادة (اختياري)',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 20),

          // ملخّص الفاتورة: قيمة الأصناف + أجرة التوصيل + المجموع
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  _summaryRow('قيمة الأصناف', '${_cart.total} ₪'),
                  const SizedBox(height: 8),
                  _deliveryRow(),
                  const Divider(height: 20),
                  _summaryRow(
                    'المجموع التقريبي',
                    '$total ₪',
                    bold: true,
                  ),
                  if (_etaMinutes != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      'الزمن المتوقّع للوصول: ~$_etaMinutes دقيقة',
                      style: TextStyle(color: YallaColors.muted, fontSize: 12),
                    ),
                  ],
                  const SizedBox(height: 8),
                  Text(
                    'أجرة التوصيل تُخصم من محفظتك، وقيمة الأصناف تُدفع للكابتن عند الاستلام.',
                    style: TextStyle(color: YallaColors.muted, fontSize: 12),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _submitting || _cart.isEmpty ? null : _submit,
              icon: _submitting
                  ? const SizedBox(
                      width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.send),
              label: const Text('تأكيد الطلب'),
            ),
          ),
        ],
      ),
    );
  }

  // سطر صنف في السلّة مع أزرار تعديل الكمّية
  Widget _cartLineTile(CartLine line) => Card(
        margin: const EdgeInsets.only(bottom: 8),
        child: ListTile(
          title: Text(line.item.name),
          subtitle: Text('${line.item.price} ₪ للوحدة'),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              IconButton(
                onPressed: () {
                  setState(() => _cart.remove(line.item));
                  // آخر صنف حُذف → لا معنى لبقاء شاشة الإتمام مفتوحة
                  if (_cart.isEmpty) Navigator.of(context).pop(false);
                },
                icon: const Icon(Icons.remove_circle_outline),
              ),
              Text('${line.qty}', style: const TextStyle(fontWeight: FontWeight.bold)),
              IconButton(
                onPressed: () => setState(() => _cart.add(line.item)),
                icon: Icon(Icons.add_circle, color: YallaColors.primary),
              ),
              SizedBox(
                width: 56,
                child: Text('${line.total} ₪', textAlign: TextAlign.end),
              ),
            ],
          ),
        ),
      );

  // سطر أجرة التوصيل (مع عرض السعر الأصلي مشطوبًا أثناء العرض — Card 89)
  Widget _deliveryRow() {
    if (_loadingQuote) {
      return _summaryRow('أجرة التوصيل', 'جارٍ الحساب...');
    }
    if (_deliveryPrice == null) {
      return _summaryRow('أجرة التوصيل', 'اختر عنوان التسليم');
    }
    if (_offerApplied && _deliveryOriginal != null) {
      return Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          const Text('أجرة التوصيل'),
          Row(
            children: [
              Text(
                '$_deliveryOriginal ₪',
                style: TextStyle(
                  decoration: TextDecoration.lineThrough,
                  color: YallaColors.muted,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                '$_deliveryPrice ₪',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  color: YallaColors.primary,
                ),
              ),
            ],
          ),
        ],
      );
    }
    return _summaryRow('أجرة التوصيل', '$_deliveryPrice ₪');
  }

  Widget _summaryRow(String label, String value, {bool bold = false}) => Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(fontWeight: bold ? FontWeight.bold : FontWeight.normal)),
          Text(
            value,
            style: TextStyle(
              fontWeight: bold ? FontWeight.bold : FontWeight.normal,
              color: bold ? YallaColors.primary : null,
            ),
          ),
        ],
      );

  // منتقي المدينة — تغييرها يُصفّر الحي المختار
  Widget _cityPicker() => DropdownButtonFormField<String>(
        value: _city,
        isExpanded: true,
        decoration: const InputDecoration(
          labelText: 'المدينة',
          prefixIcon: Icon(Icons.location_city),
          border: OutlineInputBorder(),
        ),
        items: gazaCities.map((n) => DropdownMenuItem(value: n, child: Text(n))).toList(),
        onChanged: (v) {
          setState(() {
            _city = v;
            _neighborhood = null;
            _deliveryPrice = null;
          });
        },
      );

  // منتقي الحي — يحدّد إحداثيّات التسليم ومنه تُحسب أجرة التوصيل
  Widget _neighborhoodPicker() => DropdownButtonFormField<String>(
        value: _neighborhood,
        isExpanded: true,
        decoration: InputDecoration(
          labelText: 'الحي',
          prefixIcon: const Icon(Icons.holiday_village_outlined),
          border: const OutlineInputBorder(),
          hintText: _city == null ? 'اختر المدينة أولًا' : null,
        ),
        items: neighborhoodsOf(_city)
            .map((n) => DropdownMenuItem(value: n, child: Text(n)))
            .toList(),
        onChanged: _city == null
            ? null
            : (v) {
                setState(() => _neighborhood = v);
                _refreshQuote();
              },
      );

  Widget _sectionLabel(String text, IconData icon) => Row(
        children: [
          Icon(icon, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          ),
        ],
      );

  @override
  void dispose() {
    _street.dispose();
    _details.dispose();
    _addressNote.dispose();
    _orderNote.dispose();
    super.dispose();
  }
}
