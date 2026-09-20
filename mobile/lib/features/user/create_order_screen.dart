// شاشة إنشاء طلب توصيل (تطبيق المستخدم) — نسخة بلا خريطة.
// يمكن استخدام عنوان محفوظ أو إدخال مدينة/حي يدويًا لكل من الاستلام والتسليم.

import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../../core/data/gaza_neighborhoods.dart';
import '../../core/theme/app_theme.dart';

class _AddressFields {
  String? city;
  String? neighborhood;
  Map<String, dynamic>? saved;
  final street = TextEditingController();
  final details = TextEditingController();
  final note = TextEditingController();

  List<double>? get coords {
    final raw = saved?['location']?['coordinates'];
    if (raw is List && raw.length == 2 && raw.every((e) => e is num)) {
      return raw.map((e) => (e as num).toDouble()).toList(growable: false);
    }
    return coordsOf(city, neighborhood);
  }

  Map<String, dynamic> toJson() {
    final point = coords;
    if (saved != null) {
      return {
        'address': (saved!['address'] ?? '').toString().trim(),
        'details': (saved!['label'] ?? '').toString().trim(),
        if (point != null) 'location': {'type': 'Point', 'coordinates': point},
      };
    }
    return {
      'city': city ?? '',
      'neighborhood': neighborhood ?? '',
      'street': street.text.trim(),
      'details': details.text.trim(),
      'note': note.text.trim(),
      if (point != null) 'location': {'type': 'Point', 'coordinates': point},
    };
  }

  bool get isValid {
    if (saved != null) {
      return coords != null && (saved!['address'] ?? '').toString().trim().isNotEmpty;
    }
    return city != null && neighborhood != null && coords != null;
  }

  void clear() {
    saved = null;
    city = null;
    neighborhood = null;
    street.clear();
    details.clear();
    note.clear();
  }

  void dispose() {
    street.dispose();
    details.dispose();
    note.dispose();
  }
}

class CreateOrderScreen extends StatefulWidget {
  final ApiClient api;
  const CreateOrderScreen({super.key, required this.api});

  @override
  State<CreateOrderScreen> createState() => _CreateOrderScreenState();
}

class _CreateOrderScreenState extends State<CreateOrderScreen> {
  final _pickup = _AddressFields();
  final _dropoff = _AddressFields();
  final _noteController = TextEditingController();

  List<dynamic> _savedAddresses = [];
  Map<String, dynamic>? _rewards;
  bool _loadingAddresses = true;
  bool _submitting = false;
  bool _usePoints = false;
  DateTime? _scheduledAt;

  num? _quotePrice;
  num? _quoteOriginal;
  bool _offerApplied = false;
  num? _quoteDistance;
  num? _quoteEta;
  bool _loadingQuote = false;

  int get _points => _asInt(_rewards?['points']);
  Map<String, dynamic> get _rewardRules => Map<String, dynamic>.from((_rewards?['rules'] as Map?) ?? const {});
  int get _pointsPerIls => _asInt(_rewardRules['pointsPerIls'], fallback: 100);
  int get _minOrderPoints => _asInt(_rewardRules['minOrderPoints'] ?? _rewardRules['minRedeemPoints'], fallback: _pointsPerIls);
  bool get _rewardsEnabled => _rewardRules['enabled'] != false;
  int get _usablePoints {
    if (!_usePoints || !_rewardsEnabled || _quotePrice == null || _pointsPerIls <= 0) return 0;
    final maxByOrder = (_quotePrice!.floor()) * _pointsPerIls;
    final roundedAvailable = (_points ~/ _pointsPerIls) * _pointsPerIls;
    final value = roundedAvailable < maxByOrder ? roundedAvailable : maxByOrder;
    return value >= _minOrderPoints ? value : 0;
  }
  num get _rewardDiscount => _pointsPerIls > 0 ? _usablePoints / _pointsPerIls : 0;

  @override
  void initState() {
    super.initState();
    _loadAddresses();
    _loadRewards();
  }

  Future<void> _loadRewards() async {
    try {
      final raw = await widget.api.get('/expansion/rewards');
      if (mounted) setState(() => _rewards = Map<String, dynamic>.from(raw as Map));
    } catch (_) {
      // الطلب يبقى متاحًا بدون نقاط إن تعذّر تحميل المكافآت.
    }
  }

  Future<void> _loadAddresses() async {
    try {
      final data = await widget.api.get('/features/addresses');
      if (!mounted) return;
      setState(() => _savedAddresses = data as List);
    } catch (_) {
      // يبقى الإدخال اليدوي متاحًا إذا تعذّر تحميل العناوين المحفوظة.
    } finally {
      if (mounted) setState(() => _loadingAddresses = false);
    }
  }

  void _resetQuote() {
    _quotePrice = null;
    _quoteOriginal = null;
    _quoteDistance = null;
    _quoteEta = null;
    _offerApplied = false;
  }

  Future<void> _addressChanged() async {
    if (mounted) setState(_resetQuote);
    await _refreshQuote();
  }

  Future<void> _refreshQuote() async {
    final p = _pickup.coords;
    final d = _dropoff.coords;
    if (p == null || d == null) return;
    setState(() => _loadingQuote = true);
    try {
      final q = await widget.api.post('/orders/quote', {
        'pickup': p,
        'dropoff': d,
        'vehicleType': 'motorcycle',
      });
      if (!mounted) return;
      setState(() {
        _quotePrice = q['price'];
        _quoteOriginal = q['originalPrice'];
        _offerApplied = q['offerApplied'] == true;
        _quoteDistance = q['distanceKm'];
        _quoteEta = q['etaMinutes'];
      });
    } on ApiException {
      // السعر النهائي سيعاد احتسابه في الخادم عند إنشاء الطلب.
    } finally {
      if (mounted) setState(() => _loadingQuote = false);
    }
  }

  Future<void> _pickSchedule() async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: now.add(const Duration(hours: 1)),
      firstDate: now,
      lastDate: now.add(const Duration(days: 7)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(context: context, initialTime: TimeOfDay.now());
    if (time == null) return;
    setState(() {
      _scheduledAt = DateTime(date.year, date.month, date.day, time.hour, time.minute);
    });
  }

  Future<void> _submitOrder() async {
    if (!_pickup.isValid || !_dropoff.isValid) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('اختر عنوانًا محفوظًا أو مدينة وحي صالحين لنقطتَي الاستلام والتسليم'),
        ),
      );
      return;
    }
    setState(() => _submitting = true);
    try {
      final usedPoints = _usablePoints;
      await widget.api.post('/orders', {
        'pickup': _pickup.toJson(),
        'dropoff': _dropoff.toJson(),
        'packageNote': _noteController.text,
        if (usedPoints > 0) 'rewardPoints': usedPoints,
        if (_scheduledAt != null) 'scheduledAt': _scheduledAt!.toUtc().toIso8601String(),
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(usedPoints > 0
            ? 'تم إنشاء الطلب واستخدام $usedPoints نقطة كخصم — ستصلك رسالة برمز التسليم'
            : 'تم إنشاء الطلب — ستصلك رسالة برمز التسليم')),
      );
      setState(() {
        _pickup.clear();
        _dropoff.clear();
        _noteController.clear();
        _scheduledAt = null;
        _usePoints = false;
        _resetQuote();
      });
      _loadRewards();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final canUsePoints = _rewardsEnabled && _points >= _minOrderPoints && _quotePrice != null;
    final afterPoints = _quotePrice == null ? null : (_quotePrice! - _rewardDiscount).clamp(0, double.infinity);

    return Scaffold(
      appBar: AppBar(title: const Text('طلب توصيل جديد')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 920),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(24, 20, 24, 32),
            children: [
          _sectionLabel('نقطة الاستلام', Icons.store),
          const SizedBox(height: 8),
          ..._addressInputs(_pickup),
          const SizedBox(height: 20),

          _sectionLabel('نقطة التسليم', Icons.flag),
          const SizedBox(height: 8),
          ..._addressInputs(_dropoff),
          const SizedBox(height: 20),

          _sectionLabel('الشحنة', Icons.inventory_2_outlined),
          const SizedBox(height: 8),
          TextField(
            controller: _noteController,
            decoration: const InputDecoration(
              labelText: 'وصف الشحنة (اختياري)',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),

          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('جدولة لوقت لاحق'),
            subtitle: _scheduledAt != null ? Text('$_scheduledAt'.split('.').first) : const Text('طلب فوري'),
            value: _scheduledAt != null,
            onChanged: (on) => on ? _pickSchedule() : setState(() => _scheduledAt = null),
          ),

          if (_loadingQuote || _quotePrice != null)
            Card(
              margin: const EdgeInsets.only(bottom: 12),
              child: ListTile(
                leading: const Icon(Icons.payments),
                title: _loadingQuote
                    ? const Text('جارٍ حساب السعر...')
                    : _offerApplied && _quoteOriginal != null
                        ? Row(
                            children: [
                              const Text('السعر التقريبي: '),
                              Text(
                                '$_quoteOriginal ₪',
                                style: TextStyle(
                                  decoration: TextDecoration.lineThrough,
                                  color: YallaColors.muted,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                '$_quotePrice ₪',
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  color: YallaColors.primary,
                                ),
                              ),
                            ],
                          )
                        : Text('السعر التقريبي: $_quotePrice ₪'),
                subtitle: _quoteDistance != null
                    ? Text('المسافة: ~$_quoteDistance كم'
                        '${_quoteEta != null ? ' · الزمن المتوقّع: ~$_quoteEta دقيقة' : ''}'
                        '${_offerApplied ? '\n🎉 عرض لفترة محدودة: أقصى سعر ١٠ ₪' : ''}'
                        '\nالسعر النهائي يحدّده الكابتن عند التسليم (لا يتجاوز التقريبي)')
                    : null,
                isThreeLine: _quoteDistance != null,
              ),
            ),

          if (_rewards != null)
            Card(
              margin: const EdgeInsets.only(bottom: 12),
              child: SwitchListTile.adaptive(
                value: _usePoints && canUsePoints,
                onChanged: canUsePoints ? (v) => setState(() => _usePoints = v) : null,
                secondary: const Icon(Icons.stars_outlined),
                title: const Text('استخدم نقاط Yalla', style: TextStyle(fontWeight: FontWeight.bold)),
                subtitle: Text(canUsePoints
                    ? 'لديك $_points نقطة. سيُستخدم حتى $_usablePoints نقطة كخصم على هذا الطلب فقط.'
                    : 'لديك $_points نقطة · الحد الأدنى للاستخدام $_minOrderPoints نقطة${_quotePrice == null ? ' · احسب السعر أولًا' : ''}'),
              ),
            ),

          if (_usePoints && _usablePoints > 0 && afterPoints != null)
            Card(
              margin: const EdgeInsets.only(bottom: 12),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(children: [
                  _priceRow('خصم نقاط Yalla', '-$_rewardDiscount ₪'),
                  const Divider(height: 20),
                  _priceRow('المطلوب من المحفظة تقريبًا', '$afterPoints ₪', bold: true),
                ]),
              ),
            ),

          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _submitting ? null : _submitOrder,
              icon: _submitting
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.send),
              label: const Text('تأكيد الطلب'),
            ),
          ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _priceRow(String label, String value, {bool bold = false}) => Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(fontWeight: bold ? FontWeight.bold : FontWeight.normal)),
          Text(value, style: TextStyle(fontWeight: bold ? FontWeight.bold : FontWeight.w700, color: YallaColors.primary)),
        ],
      );

  List<Widget> _addressInputs(_AddressFields f) => [
        if (_loadingAddresses)
          const LinearProgressIndicator()
        else if (_savedAddresses.isNotEmpty && f.saved == null)
          _savedAddressPicker(f),
        if (!_loadingAddresses && _savedAddresses.isNotEmpty && f.saved == null) const SizedBox(height: 8),
        if (f.saved == null) ...[
          _cityPicker(f),
          const SizedBox(height: 8),
          _neighborhoodPicker(f),
          const SizedBox(height: 8),
          TextField(
            controller: f.street,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(
              labelText: 'الشارع',
              prefixIcon: Icon(Icons.add_road),
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: f.details,
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
            controller: f.note,
            decoration: const InputDecoration(
              labelText: 'ملاحظة (اختياري)',
              prefixIcon: Icon(Icons.note_alt_outlined),
              border: OutlineInputBorder(),
            ),
          ),
        ] else
          Card(
            margin: EdgeInsets.zero,
            child: ListTile(
              leading: const Icon(Icons.bookmark_added_outlined),
              title: Text((f.saved!['label'] ?? 'عنوان محفوظ').toString()),
              subtitle: Text((f.saved!['address'] ?? '').toString()),
              trailing: TextButton(
                onPressed: () {
                  setState(() => f.saved = null);
                  _addressChanged();
                },
                child: const Text('تغيير'),
              ),
            ),
          ),
      ];

  Widget _savedAddressPicker(_AddressFields f) => DropdownButtonFormField<Map<String, dynamic>?>(
        value: null,
        isExpanded: true,
        decoration: const InputDecoration(
          labelText: 'عنوان محفوظ (اختياري)',
          prefixIcon: Icon(Icons.bookmark_outline),
          border: OutlineInputBorder(),
        ),
        items: [
          const DropdownMenuItem<Map<String, dynamic>?>(
            value: null,
            child: Text('إدخال عنوان جديد'),
          ),
          ..._savedAddresses.map((raw) {
            final address = Map<String, dynamic>.from(raw as Map);
            return DropdownMenuItem<Map<String, dynamic>?>(
              value: address,
              child: Text(
                '${address['label'] ?? 'عنوان'} — ${address['address'] ?? ''}',
                overflow: TextOverflow.ellipsis,
              ),
            );
          }),
        ],
        onChanged: (value) {
          if (value == null) return;
          setState(() => f.saved = value);
          _addressChanged();
        },
      );

  Widget _cityPicker(_AddressFields f) => DropdownButtonFormField<String>(
        value: f.city,
        isExpanded: true,
        decoration: const InputDecoration(
          labelText: 'المدينة',
          prefixIcon: Icon(Icons.location_city),
          border: OutlineInputBorder(),
        ),
        items: gazaCities.map((name) => DropdownMenuItem(value: name, child: Text(name))).toList(),
        onChanged: (v) {
          setState(() {
            f.city = v;
            f.neighborhood = null;
          });
          _addressChanged();
        },
      );

  Widget _neighborhoodPicker(_AddressFields f) {
    final names = neighborhoodsOf(f.city);
    return DropdownButtonFormField<String>(
      value: f.neighborhood,
      isExpanded: true,
      decoration: InputDecoration(
        labelText: 'الحي',
        prefixIcon: const Icon(Icons.holiday_village_outlined),
        border: const OutlineInputBorder(),
        hintText: f.city == null ? 'اختر المدينة أولًا' : null,
      ),
      items: names.map((name) => DropdownMenuItem(value: name, child: Text(name))).toList(),
      onChanged: f.city == null
          ? null
          : (v) {
              setState(() => f.neighborhood = v);
              _addressChanged();
            },
    );
  }

  Widget _sectionLabel(String text, IconData icon) => Row(
        children: [
          Icon(icon, size: 20),
          const SizedBox(width: 8),
          Text(text, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
        ],
      );

  static int _asInt(dynamic value, {int fallback = 0}) {
    if (value is num) return value.toInt();
    return int.tryParse(value?.toString() ?? '') ?? fallback;
  }

  @override
  void dispose() {
    _pickup.dispose();
    _dropoff.dispose();
    _noteController.dispose();
    super.dispose();
  }
}
