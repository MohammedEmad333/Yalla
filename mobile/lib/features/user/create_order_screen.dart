// شاشة إنشاء طلب توصيل (تطبيق المستخدم) — نسخة بلا خريطة.
// لكل نقطة (استلام/تسليم) يكتب المستخدم عنوانًا مُفصّلًا بالترتيب (Card 21):
//   الحي ← الشارع ← العنوان بالتفاصيل ← الملاحظة.
// ويختار المنطقة التقريبية فقط لتحديد الإحداثيات (لحساب المسافة وأقرب كابتن).
// يمكن لاحقًا استبدال منتقي المنطقة بخريطة تفاعلية عبر google_maps_flutter.

import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';

// مناطق تقريبية لتحديد الإحداثيات: الاسم -> [lng, lat]
const Map<String, List<double>> _presetLocations = {
  'وسط البلد، غزة': [34.4668, 31.5069],
  'حي الرمال، غزة': [34.4400, 31.5300],
  'حي الشجاعية، غزة': [34.4800, 31.5050],
  'جباليا': [34.4830, 31.5280],
  'خان يونس': [34.3060, 31.3400],
  'رفح': [34.2500, 31.2870],
};

// حقول عنوان مُفصّلة لنقطة واحدة (استلام أو تسليم) — Card 21
class _AddressFields {
  final neighborhood = TextEditingController(); // الحي
  final street = TextEditingController();        // الشارع
  final details = TextEditingController();       // العنوان بالتفاصيل
  final note = TextEditingController();          // ملاحظة

  // حمولة الموقع المُرسَلة للخادم (بلا الإحداثيات — تُضاف عند الإرسال)
  Map<String, dynamic> toJson(List<double> coords) => {
        'neighborhood': neighborhood.text.trim(),
        'street': street.text.trim(),
        'details': details.text.trim(),
        'note': note.text.trim(),
        'location': {'type': 'Point', 'coordinates': coords},
      };

  // هل أدخل المستخدم أيّ جزء من العنوان؟ (الحد الأدنى للقبول)
  bool get hasAny =>
      neighborhood.text.trim().isNotEmpty ||
      street.text.trim().isNotEmpty ||
      details.text.trim().isNotEmpty;

  void clear() {
    neighborhood.clear();
    street.clear();
    details.clear();
    note.clear();
  }

  void dispose() {
    neighborhood.dispose();
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
  // حقول العنوان المُفصّلة لكل نقطة
  final _pickup = _AddressFields();
  final _dropoff = _AddressFields();

  // المنطقة التقريبية لكل نقطة (لتحديد الإحداثيات فقط)
  String? _pickupName;
  String? _dropoffName;

  final _noteController = TextEditingController(); // وصف الشحنة (منفصل عن ملاحظة العنوان)
  bool _submitting = false;

  // وقت الجدولة الاختياري (null = طلب فوري)
  DateTime? _scheduledAt;

  // التسعيرة التقديرية القادمة من الخادم
  num? _quotePrice;
  num? _quoteDistance;
  num? _quoteEta;
  bool _loadingQuote = false;

  List<double>? get _pickupCoords => _pickupName == null ? null : _presetLocations[_pickupName];
  List<double>? get _dropoffCoords => _dropoffName == null ? null : _presetLocations[_dropoffName];

  // جلب تسعيرة تقديرية عند اكتمال النقطتين
  Future<void> _refreshQuote() async {
    if (_pickupCoords == null || _dropoffCoords == null) return;
    setState(() => _loadingQuote = true);
    try {
      final q = await widget.api.post('/orders/quote', {
        'pickup': _pickupCoords,
        'dropoff': _dropoffCoords,
        'vehicleType': 'motorcycle',
      });
      setState(() {
        _quotePrice = q['price'];
        _quoteDistance = q['distanceKm'];
        _quoteEta = q['etaMinutes'];
      });
    } on ApiException {
      // نتجاهل خطأ التسعيرة — السعر يُحسب نهائيًا في الخادم عند الإنشاء
    } finally {
      if (mounted) setState(() => _loadingQuote = false);
    }
  }

  // اختيار تاريخ ووقت الجدولة (ضمن 7 أيام قادمة)
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

  // إرسال الطلب للـ Backend
  Future<void> _submitOrder() async {
    if (!_pickup.hasAny || !_dropoff.hasAny) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('أدخل عنوان الاستلام والتسليم (الحي/الشارع على الأقلّ)')),
      );
      return;
    }
    if (_pickupCoords == null || _dropoffCoords == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('اختر المنطقة التقريبية للاستلام والتسليم')),
      );
      return;
    }
    setState(() => _submitting = true);
    try {
      await widget.api.post('/orders', {
        'pickup': _pickup.toJson(_pickupCoords!),
        'dropoff': _dropoff.toJson(_dropoffCoords!),
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
        _pickupName = null;
        _dropoffName = null;
        _noteController.clear();
        _scheduledAt = null;
        _quotePrice = _quoteDistance = _quoteEta = null;
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
          // نقطة الاستلام: عنوان مُفصّل + المنطقة التقريبية
          _sectionLabel('نقطة الاستلام', Icons.store),
          const SizedBox(height: 8),
          ..._addressInputs(_pickup),
          const SizedBox(height: 8),
          _locationPicker(
            label: 'المنطقة التقريبية (لحساب المسافة)',
            icon: Icons.map,
            value: _pickupName,
            onChanged: (v) {
              setState(() => _pickupName = v);
              _refreshQuote();
            },
          ),
          const SizedBox(height: 20),

          // نقطة التسليم: عنوان مُفصّل + المنطقة التقريبية
          _sectionLabel('نقطة التسليم', Icons.flag),
          const SizedBox(height: 8),
          ..._addressInputs(_dropoff),
          const SizedBox(height: 8),
          _locationPicker(
            label: 'المنطقة التقريبية (لحساب المسافة)',
            icon: Icons.map,
            value: _dropoffName,
            onChanged: (v) {
              setState(() => _dropoffName = v);
              _refreshQuote();
            },
          ),
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

          // جدولة لوقت لاحق (اختياري)
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('جدولة لوقت لاحق'),
            subtitle: _scheduledAt != null ? Text('$_scheduledAt'.split('.').first) : const Text('طلب فوري'),
            value: _scheduledAt != null,
            onChanged: (on) => on ? _pickSchedule() : setState(() => _scheduledAt = null),
          ),

          // بطاقة التسعيرة
          if (_loadingQuote || _quotePrice != null)
            Card(
              margin: const EdgeInsets.only(bottom: 12),
              child: ListTile(
                leading: const Icon(Icons.payments),
                title: _loadingQuote
                    ? const Text('جارٍ حساب السعر...')
                    : Text('السعر التقديري: $_quotePrice ₪'),
                subtitle: _quoteDistance != null
                    ? Text('المسافة: ~$_quoteDistance كم'
                        '${_quoteEta != null ? ' · الزمن المتوقّع: ~$_quoteEta دقيقة' : ''}')
                    : null,
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

  // حقول العنوان المُفصّلة بالترتيب المطلوب: الحي ← الشارع ← التفاصيل ← الملاحظة (Card 21)
  List<Widget> _addressInputs(_AddressFields f) => [
        TextField(
          controller: f.neighborhood,
          textInputAction: TextInputAction.next,
          decoration: const InputDecoration(
            labelText: 'الحي',
            prefixIcon: Icon(Icons.location_city),
            border: OutlineInputBorder(),
          ),
        ),
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
      ];

  // عنوان قسم (نقطة استلام/تسليم)
  Widget _sectionLabel(String text, IconData icon) => Row(
        children: [
          Icon(icon, size: 20),
          const SizedBox(width: 8),
          Text(text, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
        ],
      );

  // منتقي المنطقة التقريبية (لتحديد الإحداثيات)
  Widget _locationPicker({
    required String label,
    required IconData icon,
    required String? value,
    required ValueChanged<String?> onChanged,
  }) {
    return DropdownButtonFormField<String>(
      value: value,
      isExpanded: true,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon),
        border: const OutlineInputBorder(),
      ),
      items: _presetLocations.keys
          .map((name) => DropdownMenuItem(value: name, child: Text(name)))
          .toList(),
      onChanged: onChanged,
    );
  }

  @override
  void dispose() {
    _pickup.dispose();
    _dropoff.dispose();
    _noteController.dispose();
    super.dispose();
  }
}
