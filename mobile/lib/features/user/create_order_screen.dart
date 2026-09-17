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
  bool _loadingAddresses = true;
  bool _submitting = false;
  DateTime? _scheduledAt;

  num? _quotePrice;
  num? _quoteOriginal;
  bool _offerApplied = false;
  num? _quoteDistance;
  num? _quoteEta;
  bool _loadingQuote = false;

  @override
  void initState() {
    super.initState();
    _loadAddresses();
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
      await widget.api.post('/orders', {
        'pickup': _pickup.toJson(),
        'dropoff': _dropoff.toJson(),
        'packageNote': _noteController.text,
        if (_scheduledAt != null) 'scheduledAt': _scheduledAt!.toUtc().toIso8601String(),
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم إنشاء الطلب — ستصلك رسالة برمز التسليم')),
      );
      setState(() {
        _pickup.clear();
        _dropoff.clear();
        _noteController.clear();
        _scheduledAt = null;
        _resetQuote();
      });
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('طلب توصيل جديد')),
      body: ListView(
        padding: const EdgeInsets.all(16),
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
    );
  }

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

  @override
  void dispose() {
    _pickup.dispose();
    _dropoff.dispose();
    _noteController.dispose();
    super.dispose();
  }
}
