// شاشة إنشاء طلب توصيل (تطبيق المستخدم) — نسخة بلا خريطة.
// لكل نقطة (استلام/تسليم) يختار المستخدم "المدينة" ثمّ "الحي" (Card 109)،
// ومنه تُشتقّ الإحداثيّات لحساب المسافة والسعر التقريبي (كل ٢٥٠م = ١ شيكل)،
// ثم يكمل العنوان: الشارع ← العنوان بالتفاصيل ← الملاحظة (Card 21).
// ملاحظة: يجب أن يكفي رصيد المحفظة للسعر التقريبي قبل تأكيد الطلب (يتحقّق الخادم).

import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../../core/data/gaza_neighborhoods.dart';
import '../../core/theme/app_theme.dart';

// حقول عنوان نقطة واحدة (استلام أو تسليم) — المدينة ثمّ الحي منسدلان (Card 109)
class _AddressFields {
  String? city; // المدينة (غزة/شمال غزة/الوسطى/خانيونس/رفح) — تحدّد قائمة الأحياء
  String? neighborhood; // الحي (يعتمد على المدينة) — يحدّد الإحداثيّات
  final street = TextEditingController(); // الشارع
  final details = TextEditingController(); // العنوان بالتفاصيل
  final note = TextEditingController(); // ملاحظة

  // إحداثيّات النقطة مشتقّة من المدينة + الحي المختار [lng, lat]
  List<double>? get coords => coordsOf(city, neighborhood);

  // حمولة الموقع المُرسَلة للخادم
  Map<String, dynamic> toJson() => {
        'city': city ?? '',
        'neighborhood': neighborhood ?? '',
        'street': street.text.trim(),
        'details': details.text.trim(),
        'note': note.text.trim(),
        if (coords != null) 'location': {'type': 'Point', 'coordinates': coords},
      };

  bool get isValid => city != null && neighborhood != null;

  void clear() {
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

  final _noteController = TextEditingController(); // وصف الشحنة (منفصل عن ملاحظة العنوان)
  bool _submitting = false;

  // وقت الجدولة الاختياري (null = طلب فوري)
  DateTime? _scheduledAt;

  // التسعيرة التقديرية القادمة من الخادم
  num? _quotePrice;
  num? _quoteOriginal; // Card 89: السعر قبل العرض (يُعرض مشطوبًا)
  bool _offerApplied = false; // Card 89: هل طُبّق عرض السقف (٨ شيكل)؟
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
        _quoteOriginal = q['originalPrice'];
        _offerApplied = q['offerApplied'] == true;
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
        const SnackBar(content: Text('اختر مدينة وحي الاستلام ومدينة وحي التسليم')),
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
        _quotePrice = _quoteOriginal = _quoteDistance = _quoteEta = null;
        _offerApplied = false;
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
                    // Card 89: أثناء العرض نعرض السعر الأصلي مشطوبًا وسعر العرض بجانبه
                    : _offerApplied && _quoteOriginal != null
                        ? Row(
                            children: [
                              const Text('السعر التقريبي: '),
                              Text(
                                '$_quoteOriginal ₪',
                                style: const TextStyle(
                                  decoration: TextDecoration.lineThrough,
                                  color: YallaColors.muted,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                '$_quotePrice ₪',
                                style: const TextStyle(
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
                        '${_offerApplied ? '\n🎉 عرض لفترة محدودة: أقصى سعر ٨ ₪' : ''}'
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

  // حقول عنوان نقطة: المدينة (منسدل) ← الحي (منسدل) ← الشارع ← التفاصيل ← الملاحظة
  List<Widget> _addressInputs(_AddressFields f) => [
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
      ];

  // منتقي المدينة (Card 109) — قبل الحي. تغييرها يُصفّر الحي المختار.
  Widget _cityPicker(_AddressFields f) => DropdownButtonFormField<String>(
        value: f.city,
        isExpanded: true,
        decoration: const InputDecoration(
          labelText: 'المدينة',
          prefixIcon: Icon(Icons.location_city),
          border: OutlineInputBorder(),
        ),
        items: gazaCities
            .map((name) => DropdownMenuItem(value: name, child: Text(name)))
            .toList(),
        onChanged: (v) {
          setState(() {
            f.city = v;
            f.neighborhood = null; // إعادة ضبط الحي عند تغيير المدينة
          });
          _refreshQuote();
        },
      );

  // منتقي الحي (Card 109) — عناصره تعتمد على المدينة المختارة، يحدّد الإحداثيّات
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
      items: names
          .map((name) => DropdownMenuItem(value: name, child: Text(name)))
          .toList(),
      // معطّل حتى تُختار المدينة
      onChanged: f.city == null
          ? null
          : (v) {
              setState(() => f.neighborhood = v);
              _refreshQuote();
            },
    );
  }

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
