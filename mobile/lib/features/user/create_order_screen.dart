// شاشة إنشاء طلب توصيل (تطبيق المستخدم) — نسخة بلا خريطة.
// لكل نقطة (استلام/تسليم) يختار المستخدم "الحي" من أحياء مدينة غزة (Card 27)،
// ومنه تُشتقّ الإحداثيّات لحساب المسافة والسعر التقريبي (كل ١٦٠م = ١ شيكل)،
// ثم يكمل العنوان: الشارع ← العنوان بالتفاصيل ← الملاحظة (Card 21).
// ملاحظة: يجب أن يكفي رصيد المحفظة للسعر التقريبي قبل تأكيد الطلب (يتحقّق الخادم).

import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../../core/data/gaza_neighborhoods.dart';

// حقول عنوان نقطة واحدة (استلام أو تسليم) — الحي أصبح منسدلًا (Card 27)
class _AddressFields {
  String? neighborhood; // الحي (من أحياء غزة) — يحدّد الإحداثيّات
  final street = TextEditingController(); // الشارع
  final details = TextEditingController(); // العنوان بالتفاصيل
  final note = TextEditingController(); // ملاحظة

  // إحداثيّات النقطة مشتقّة من الحي المختار [lng, lat]
  List<double>? get coords =>
      neighborhood == null ? null : kGazaNeighborhoods[neighborhood];

  // حمولة الموقع المُرسَلة للخادم
  Map<String, dynamic> toJson() => {
        'neighborhood': neighborhood ?? '',
        'street': street.text.trim(),
        'details': details.text.trim(),
        'note': note.text.trim(),
        if (coords != null) 'location': {'type': 'Point', 'coordinates': coords},
      };

  bool get isValid => neighborhood != null;

  void clear() {
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

  final _noteController = TextEditingController(); // وصف الشحنة (منفصل عن ملاحظة العنوان)
  bool _submitting = false;

  // وقت الجدولة الاختياري (null = طلب فوري)
  DateTime? _scheduledAt;

  // التسعيرة التقديرية القادمة من الخادم
  num? _quotePrice;
  num? _quoteDistance;
  num? _quoteEta;
  bool _loadingQuote = false;

  // جلب تسعيرة تقديرية عند اكتمال اختيار حيّ النقطتين
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
    if (!_pickup.isValid || !_dropoff.isValid) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('اختر حي الاستلام وحي التسليم')),
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
        _quotePrice = _quoteDistance = _quoteEta = null;
      });
    } on ApiException catch (e) {
      // يشمل رسالة "رصيد محفظتك لا يكفي للسعر التقريبي — اشحن محفظتك أولًا"
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
          // نقطة الاستلام: الحي (يحدّد الموقع) + بقيّة العنوان
          _sectionLabel('نقطة الاستلام', Icons.store),
          const SizedBox(height: 8),
          ..._addressInputs(_pickup),
          const SizedBox(height: 20),

          // نقطة التسليم
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

          // جدولة لوقت لاحق (اختياري)
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('جدولة لوقت لاحق'),
            subtitle: _scheduledAt != null ? Text('$_scheduledAt'.split('.').first) : const Text('طلب فوري'),
            value: _scheduledAt != null,
            onChanged: (on) => on ? _pickSchedule() : setState(() => _scheduledAt = null),
          ),

          // بطاقة التسعيرة التقريبية
          if (_loadingQuote || _quotePrice != null)
            Card(
              margin: const EdgeInsets.only(bottom: 12),
              child: ListTile(
                leading: const Icon(Icons.payments),
                title: _loadingQuote
                    ? const Text('جارٍ حساب السعر...')
                    : Text('السعر التقريبي: $_quotePrice ₪'),
                subtitle: _quoteDistance != null
                    ? Text('المسافة: ~$_quoteDistance كم'
                        '${_quoteEta != null ? ' · الزمن المتوقّع: ~$_quoteEta دقيقة' : ''}'
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

  // حقول عنوان نقطة: الحي (منسدل) ← الشارع ← التفاصيل ← الملاحظة
  List<Widget> _addressInputs(_AddressFields f) => [
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
      ];

  // منتقي الحي من أحياء غزة (Card 27) — يحدّد الإحداثيّات ويُحدّث التسعيرة
  Widget _neighborhoodPicker(_AddressFields f) => DropdownButtonFormField<String>(
        value: f.neighborhood,
        isExpanded: true,
        decoration: const InputDecoration(
          labelText: 'الحي',
          prefixIcon: Icon(Icons.location_city),
          border: OutlineInputBorder(),
        ),
        items: gazaNeighborhoodNames
            .map((name) => DropdownMenuItem(value: name, child: Text(name)))
            .toList(),
        onChanged: (v) {
          setState(() => f.neighborhood = v);
          _refreshQuote();
        },
      );

  // عنوان قسم (نقطة استلام/تسليم)
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
