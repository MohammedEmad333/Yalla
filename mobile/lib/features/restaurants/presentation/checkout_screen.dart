import 'dart:async';

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
  final _recipientName = TextEditingController();
  final _recipientPhone = TextEditingController();

  List<dynamic> _savedAddresses = [];
  Map<String, dynamic>? _saved;
  Map<String, dynamic>? _rewards;
  bool _loadingAddresses = true;
  bool _submitting = false;
  bool _loadingQuote = false;
  bool _checkingCoupon = false;
  bool _forSomeoneElse = false;
  bool _scheduled = false;
  bool _usePoints = false;
  DateTime? _scheduledAt;
  num? _deliveryPrice;
  num? _etaMinutes;
  num _discount = 0;
  String _couponMessage = '';
  Timer? _quoteDebounce;
  int _quoteSerial = 0;
  final ValueNotifier<int> _cartRevision = ValueNotifier<int>(0);
  final ValueNotifier<int> _pricingRevision = ValueNotifier<int>(0);

  Cart get _cart => widget.cart;
  int get _points => _asInt(_rewards?['points']);
  Map<String, dynamic> get _rewardRules => Map<String, dynamic>.from((_rewards?['rules'] as Map?) ?? const {});
  int get _pointsPerIls => _asInt(_rewardRules['pointsPerIls'], fallback: 100);
  int get _minOrderPoints => _asInt(_rewardRules['minOrderPoints'] ?? _rewardRules['minRedeemPoints'], fallback: _pointsPerIls);
  bool get _rewardsEnabled => _rewardRules['enabled'] != false;

  num get _itemsAfterDiscount => (_cart.total - _discount).clamp(0, double.infinity);
  num get _preRewardTotal => _itemsAfterDiscount + (_deliveryPrice ?? 0);
  int get _usablePoints {
    if (!_usePoints || !_rewardsEnabled || _deliveryPrice == null || _pointsPerIls <= 0) return 0;
    final maxByOrder = _preRewardTotal.floor() * _pointsPerIls;
    final roundedAvailable = (_points ~/ _pointsPerIls) * _pointsPerIls;
    final value = roundedAvailable < maxByOrder ? roundedAvailable : maxByOrder;
    return value >= _minOrderPoints ? value : 0;
  }
  num get _rewardDiscount => _pointsPerIls > 0 ? _usablePoints / _pointsPerIls : 0;
  num get _totalAfterRewards => (_preRewardTotal - _rewardDiscount).clamp(0, double.infinity);

  @override
  void initState() {
    super.initState();
    _loadInitialData();
  }

  @override
  void dispose() {
    _quoteDebounce?.cancel();
    _cartRevision.dispose();
    _pricingRevision.dispose();
    for (final c in [_street, _details, _addressNote, _orderNote, _coupon, _recipientName, _recipientPhone]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _loadInitialData() async {
    dynamic rewards;
    dynamic addresses;
    try {
      final results = await Future.wait<dynamic>([
        widget.api.getCached('/expansion/rewards', ttl: const Duration(seconds: 30)),
        widget.api.getCached('/features/addresses', ttl: const Duration(seconds: 30)),
      ]);
      rewards = results[0];
      addresses = results[1];
    } catch (_) {
      // يبقى الإدخال اليدوي متاحًا إذا تعذر جزء من بيانات البداية.
    }
    if (!mounted) return;
    setState(() {
      if (rewards is Map) {
        _rewards = Map<String, dynamic>.from(rewards);
      }
      if (addresses is List) {
        _savedAddresses = addresses;
      }
      _loadingAddresses = false;
    });
  }

  void _scheduleQuoteRefresh() {
    _quoteDebounce?.cancel();
    _quoteDebounce = Timer(const Duration(milliseconds: 250), _refreshQuote);
  }

  List<double>? get _manualDropoffCoords => coordsOf(_city, _neighborhood);
  List<double>? get _dropoffCoords {
    final raw = _saved?['location']?['coordinates'];
    if (raw is List && raw.length == 2) return raw.map((e) => (e as num).toDouble()).toList(growable: false);
    return _manualDropoffCoords;
  }

  List<double>? get _pickupCoords {
    final byNeighborhood = coordsOf(_cart.restaurant.city, _cart.restaurant.neighborhood);
    if (byNeighborhood != null) return byNeighborhood;
    return _cart.restaurant.coords;
  }

  Map<String, dynamic>? get _dropoffPayload {
    final coords = _dropoffCoords;
    if (coords == null) return null;
    final recipient = <String, dynamic>{
      if (_forSomeoneElse && _recipientName.text.trim().isNotEmpty) 'contactName': _recipientName.text.trim(),
      if (_forSomeoneElse && _recipientPhone.text.trim().isNotEmpty) 'contactPhone': _recipientPhone.text.trim(),
    };
    if (_saved != null) {
      return {
        'address': (_saved!['address'] ?? '').toString(),
        'details': (_saved!['label'] ?? '').toString(),
        'location': {'type': 'Point', 'coordinates': coords},
        ...recipient,
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
      ...recipient,
    };
  }

  Future<void> _refreshQuote() async {
    final pickup = _pickupCoords, dropoff = _dropoffCoords;
    if (pickup == null || dropoff == null) return;

    final requestId = ++_quoteSerial;
    _loadingQuote = true;
    _pricingRevision.value++;
    try {
      final q = await _repo.deliveryQuote(pickup, dropoff);
      if (!mounted || requestId != _quoteSerial) return;
      _deliveryPrice = q['price'] as num?;
      _etaMinutes = ((q['etaMinutes'] as num?) ?? 0) + _cart.restaurant.prepMinutes;
      _pricingRevision.value++;
    } finally {
      if (mounted && requestId == _quoteSerial) {
        _loadingQuote = false;
        _pricingRevision.value++;
      }
    }
  }

  Future<void> _validateCoupon() async {
    final code = _coupon.text.trim();
    if (code.isEmpty) {
      _discount = 0;
      _couponMessage = '';
      _pricingRevision.value++;
      return;
    }
    _checkingCoupon = true;
    _pricingRevision.value++;
    try {
      final raw = await widget.api.post('/features/coupons/validate', {
        'code': code,
        'subtotal': _cart.total,
        'restaurantId': _cart.restaurant.id,
      });
      final data = Map<String, dynamic>.from(raw as Map);
      if (mounted) {
        _discount = (data['discount'] as num?) ?? 0;
        _couponMessage = 'تم تطبيق الكوبون: خصم $_discount ₪';
        _pricingRevision.value++;
      }
    } on ApiException catch (e) {
      if (mounted) {
        _discount = 0;
        _couponMessage = e.message;
        _pricingRevision.value++;
      }
    } finally {
      if (mounted) {
        _checkingCoupon = false;
        _pricingRevision.value++;
      }
    }
  }

  Future<void> _pickSchedule() async {
    final now = DateTime.now();
    final date = await showDatePicker(context: context, firstDate: now, lastDate: now.add(const Duration(days: 14)), initialDate: _scheduledAt ?? now);
    if (date == null || !mounted) return;
    final time = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime((_scheduledAt ?? now.add(const Duration(hours: 1)))));
    if (time == null) return;
    final selected = DateTime(date.year, date.month, date.day, time.hour, time.minute);
    if (selected.isBefore(now.add(const Duration(minutes: 20)))) {
      _snack('اختر موعدًا بعد 20 دقيقة على الأقل');
      return;
    }
    setState(() => _scheduledAt = selected);
  }

  Future<void> _submit() async {
    final dropoff = _dropoffPayload;
    if (dropoff == null) return _snack('اختر عنوانًا محفوظًا أو مدينة وحي التسليم');
    if (_cart.isEmpty) return _snack('السلّة فارغة');
    if (_forSomeoneElse && _recipientPhone.text.trim().length < 6) return _snack('أدخل رقم مستلم صحيح');
    if (_scheduled && _scheduledAt == null) return _snack('اختر موعد الطلب');
    setState(() => _submitting = true);
    try {
      final usedPoints = _usablePoints;
      await widget.api.post('/commerce/restaurant-order', {
        'restaurantId': _cart.restaurant.id,
        'items': _cart.toItemsPayload(),
        'dropoff': dropoff,
        if (_orderNote.text.trim().isNotEmpty) 'note': _orderNote.text.trim(),
        if (_coupon.text.trim().isNotEmpty) 'couponCode': _coupon.text.trim(),
        if (usedPoints > 0) 'rewardPoints': usedPoints,
        if (_scheduled && _scheduledAt != null) 'scheduledAt': _scheduledAt!.toUtc().toIso8601String(),
      });
      if (!mounted) return;
      final base = _scheduled ? 'تمت جدولة الطلب بنجاح' : 'تم إرسال طلبك للمطعم';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(usedPoints > 0 ? '$base واستخدام $usedPoints نقطة كخصم' : base)));
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) _snack(e.message == 'الرصيد غير كافٍ' ? 'رصيد محفظتك غير كافٍ لإتمام الطلب' : e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _snack(String text) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('إتمام الطلب')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _section('طلبك من ${_cart.restaurant.name}', Icons.storefront),
          const SizedBox(height: 8),
          ValueListenableBuilder<int>(
            valueListenable: _cartRevision,
            builder: (context, _, __) => Column(
              children: _cart.lines.values.map(_cartLine).toList(growable: false),
            ),
          ),
          const SizedBox(height: 20),
          _section('عنوان التسليم', Icons.location_on_outlined),
          const SizedBox(height: 8),
          if (_loadingAddresses) const LinearProgressIndicator() else if (_savedAddresses.isNotEmpty)
            DropdownButtonFormField<Map<String, dynamic>?>(
              value: _saved,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'عنوان محفوظ (اختياري)', prefixIcon: Icon(Icons.bookmark_outline), border: OutlineInputBorder()),
              items: [
                const DropdownMenuItem<Map<String, dynamic>?>(value: null, child: Text('إدخال عنوان جديد')),
                ..._savedAddresses.map((raw) {
                  final a = Map<String, dynamic>.from(raw as Map);
                  return DropdownMenuItem<Map<String, dynamic>?>(value: a, child: Text('${a['label'] ?? 'عنوان'} — ${a['address'] ?? ''}', overflow: TextOverflow.ellipsis));
                }),
              ],
              onChanged: (v) { setState(() { _saved = v; _deliveryPrice = null; }); _pricingRevision.value++; if (v != null) _scheduleQuoteRefresh(); },
            ),
          if (_saved == null) ...[
            if (_savedAddresses.isNotEmpty) const SizedBox(height: 10),
            _cityPicker(), const SizedBox(height: 8), _neighborhoodPicker(), const SizedBox(height: 8),
            TextField(controller: _street, decoration: const InputDecoration(labelText: 'الشارع', prefixIcon: Icon(Icons.add_road), border: OutlineInputBorder())),
            const SizedBox(height: 8),
            TextField(controller: _details, decoration: const InputDecoration(labelText: 'العنوان بالتفصيل', prefixIcon: Icon(Icons.home_outlined), border: OutlineInputBorder())),
            const SizedBox(height: 8),
            TextField(controller: _addressNote, decoration: const InputDecoration(labelText: 'ملاحظة على العنوان', prefixIcon: Icon(Icons.note_alt_outlined), border: OutlineInputBorder())),
          ],
          const SizedBox(height: 12),
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            value: _forSomeoneElse,
            onChanged: (v) => setState(() => _forSomeoneElse = v),
            title: const Text('الطلب لشخص آخر', style: TextStyle(fontWeight: FontWeight.w800)),
            subtitle: const Text('أرسل اسم ورقم المستلم للكابتن'),
          ),
          if (_forSomeoneElse) ...[
            TextField(controller: _recipientName, decoration: const InputDecoration(labelText: 'اسم المستلم', prefixIcon: Icon(Icons.person_outline))),
            const SizedBox(height: 8),
            TextField(controller: _recipientPhone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'رقم المستلم', prefixIcon: Icon(Icons.phone_outlined))),
          ],
          const SizedBox(height: 20),
          _section('موعد الطلب', Icons.schedule_outlined),
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            value: _scheduled,
            onChanged: (v) => setState(() { _scheduled = v; if (!v) _scheduledAt = null; }),
            title: Text(_scheduled ? 'طلب مجدول' : 'في أقرب وقت'),
            subtitle: _scheduledAt == null ? const Text('يمكنك الجدولة خلال 14 يومًا') : Text('${_scheduledAt!.day}/${_scheduledAt!.month} · ${TimeOfDay.fromDateTime(_scheduledAt!).format(context)}'),
            secondary: _scheduled ? IconButton(onPressed: _pickSchedule, icon: const Icon(Icons.edit_calendar_outlined)) : null,
          ),
          if (_scheduled && _scheduledAt == null) OutlinedButton.icon(onPressed: _pickSchedule, icon: const Icon(Icons.calendar_month), label: const Text('اختيار الموعد')),
          const SizedBox(height: 20),
          _section('كوبون الخصم', Icons.local_offer_outlined),
          const SizedBox(height: 8),
          ValueListenableBuilder<int>(
            valueListenable: _pricingRevision,
            builder: (context, _, __) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(children: [
                  Expanded(child: TextField(controller: _coupon, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(labelText: 'رمز الكوبون', border: OutlineInputBorder()))),
                  const SizedBox(width: 8),
                  FilledButton.tonal(onPressed: _checkingCoupon ? null : _validateCoupon, child: _checkingCoupon ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('تطبيق')),
                ]),
                if (_couponMessage.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(_couponMessage, style: TextStyle(color: _discount > 0 ? YallaColors.success : YallaColors.error)),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          ValueListenableBuilder<int>(
            valueListenable: _pricingRevision,
            builder: (context, _, __) {
              final canUsePoints = _rewardsEnabled && _points >= _minOrderPoints && _deliveryPrice != null;
              if (_rewards == null) return const SizedBox.shrink();
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _section('نقاط Yalla', Icons.stars_outlined),
                  Card(
                    child: SwitchListTile.adaptive(
                      value: _usePoints && canUsePoints,
                      onChanged: canUsePoints
                          ? (v) {
                              _usePoints = v;
                              _pricingRevision.value++;
                            }
                          : null,
                      title: const Text('استخدم النقاط في هذا الطلب', style: TextStyle(fontWeight: FontWeight.w800)),
                      subtitle: Text(canUsePoints
                          ? 'لديك $_points نقطة · سيُستخدم حتى $_usablePoints نقطة كخصم.'
                          : 'لديك $_points نقطة · الحد الأدنى $_minOrderPoints نقطة${_deliveryPrice == null ? ' · اختر عنوان التسليم أولًا' : ''}'),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
              );
            },
          ),

          _section('ملاحظة للمطعم', Icons.chat_bubble_outline),
          const SizedBox(height: 8),
          TextField(controller: _orderNote, maxLines: 2, decoration: const InputDecoration(labelText: 'مثال: بلا بصل، صلصة زيادة', border: OutlineInputBorder())),
          const SizedBox(height: 20),
          ValueListenableBuilder<int>(
            valueListenable: _pricingRevision,
            builder: (context, _, __) => Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(children: [
                  _summary('قيمة الأصناف', '${_cart.total} ₪'),
                  if (_discount > 0) ...[const SizedBox(height: 8), _summary('خصم الكوبون', '-$_discount ₪', accent: true)],
                  const SizedBox(height: 8),
                  _deliveryRow(),
                  if (_usePoints && _usablePoints > 0) ...[
                    const SizedBox(height: 8),
                    _summary('خصم نقاط Yalla', '-$_rewardDiscount ₪', accent: true),
                  ],
                  const Divider(height: 22),
                  _summary('المجموع التقريبي', '$_totalAfterRewards ₪', bold: true),
                  if (_etaMinutes != null) ...[
                    const SizedBox(height: 8),
                    Text('الزمن المتوقع: ~$_etaMinutes دقيقة', style: TextStyle(color: YallaColors.muted, fontSize: 12)),
                  ],
                ]),
              ),
            ),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(onPressed: _submitting ? null : _submit, icon: _submitting ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.send), label: Text(_scheduled ? 'تأكيد الجدولة' : 'تأكيد الطلب')),
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
          _cart.removeLine(line);
          _cartRevision.value++;
          _pricingRevision.value++;
          if (_cart.isEmpty) Navigator.of(context).pop(false);
        }, icon: const Icon(Icons.remove_circle_outline)),
        Text('${line.qty}', style: const TextStyle(fontWeight: FontWeight.bold)),
        IconButton(onPressed: () {
          _cart.add(line.item, variant: line.variant, options: line.options);
          _cartRevision.value++;
          _pricingRevision.value++;
        }, icon: Icon(Icons.add_circle, color: YallaColors.primary)),
      ]),
    ),
  );

  Widget _deliveryRow() {
    if (_loadingQuote) return _summary('أجرة التوصيل', 'جارٍ الحساب...');
    if (_deliveryPrice == null) return _summary('أجرة التوصيل', 'اختر عنوان التسليم');
    return _summary('أجرة التوصيل', '$_deliveryPrice ₪');
  }

  Widget _summary(String label, String value, {bool bold = false, bool accent = false}) => Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
    Text(label, style: TextStyle(fontWeight: bold ? FontWeight.bold : FontWeight.normal)),
    Text(value, style: TextStyle(fontWeight: bold ? FontWeight.bold : FontWeight.normal, color: (bold || accent) ? YallaColors.primary : null)),
  ]);

  Widget _cityPicker() => DropdownButtonFormField<String>(
    value: _city, isExpanded: true,
    decoration: const InputDecoration(labelText: 'المدينة', prefixIcon: Icon(Icons.location_city), border: OutlineInputBorder()),
    items: gazaCities.map((n) => DropdownMenuItem(value: n, child: Text(n))).toList(),
    onChanged: (v) { setState(() { _city = v; _neighborhood = null; _deliveryPrice = null; }); _pricingRevision.value++; },
  );

  Widget _neighborhoodPicker() => DropdownButtonFormField<String>(
    value: _neighborhood, isExpanded: true,
    decoration: InputDecoration(labelText: 'الحي', prefixIcon: const Icon(Icons.holiday_village_outlined), border: const OutlineInputBorder(), hintText: _city == null ? 'اختر المدينة أولًا' : null),
    items: neighborhoodsOf(_city).map((n) => DropdownMenuItem(value: n, child: Text(n))).toList(),
    onChanged: _city == null ? null : (v) { setState(() => _neighborhood = v); _scheduleQuoteRefresh(); },
  );

  Widget _section(String text, IconData icon) => Row(children: [Icon(icon, size: 20), const SizedBox(width: 8), Expanded(child: Text(text, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)))]);

  static int _asInt(dynamic value, {int fallback = 0}) {
    if (value is num) return value.toInt();
    return int.tryParse(value?.toString() ?? '') ?? fallback;
  }
}
