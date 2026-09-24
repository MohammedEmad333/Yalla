// شاشة إنشاء طلب توصيل (تطبيق المستخدم) — نسخة بلا خريطة.
// واجهة محسّنة لتقليل طول النموذج ووضوح خطوات الاستلام والتسليم.

import 'package:flutter/material.dart';

import '../../core/data/gaza_neighborhoods.dart';
import '../../core/network/api_client.dart';
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
  num? _quoteDistance;
  num? _quoteEta;
  bool _loadingQuote = false;

  int get _points => _asInt(_rewards?['points']);
  Map<String, dynamic> get _rewardRules =>
      Map<String, dynamic>.from((_rewards?['rules'] as Map?) ?? const {});
  int get _pointsPerIls => _asInt(_rewardRules['pointsPerIls'], fallback: 100);
  int get _minOrderPoints => _asInt(
        _rewardRules['minOrderPoints'] ?? _rewardRules['minRedeemPoints'],
        fallback: _pointsPerIls,
      );
  bool get _rewardsEnabled => _rewardRules['enabled'] != false;
  int get _usablePoints {
    if (!_usePoints ||
        !_rewardsEnabled ||
        _quotePrice == null ||
        _pointsPerIls <= 0) {
      return 0;
    }
    final maxByOrder = (_quotePrice!.floor()) * _pointsPerIls;
    final roundedAvailable = (_points ~/ _pointsPerIls) * _pointsPerIls;
    final value = roundedAvailable < maxByOrder ? roundedAvailable : maxByOrder;
    return value >= _minOrderPoints ? value : 0;
  }

  num get _rewardDiscount =>
      _pointsPerIls > 0 ? _usablePoints / _pointsPerIls : 0;

  @override
  void initState() {
    super.initState();
    _loadAddresses();
    _loadRewards();
  }

  Future<void> _loadRewards() async {
    try {
      final raw = await widget.api.get('/expansion/rewards');
      if (mounted) {
        setState(() => _rewards = Map<String, dynamic>.from(raw as Map));
      }
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
    } finally {
      if (mounted) setState(() => _loadingAddresses = false);
    }
  }

  void _resetQuote() {
    _quotePrice = null;
    _quoteDistance = null;
    _quoteEta = null;
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
        _quoteDistance = q['distanceKm'];
        _quoteEta = q['etaMinutes'];
      });
    } on ApiException {
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
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.now(),
    );
    if (time == null) return;
    setState(() {
      _scheduledAt =
          DateTime(date.year, date.month, date.day, time.hour, time.minute);
    });
  }

  Future<void> _submitOrder() async {
    if (!_pickup.isValid || !_dropoff.isValid) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'اختر عنوانًا محفوظًا أو مدينة وحي صالحين لنقطتَي الاستلام والتسليم',
          ),
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
        if (_scheduledAt != null)
          'scheduledAt': _scheduledAt!.toUtc().toIso8601String(),
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            usedPoints > 0
                ? 'تم إنشاء الطلب واستخدام $usedPoints نقطة كخصم — ستصلك رسالة برمز التسليم'
                : 'تم إنشاء الطلب — ستصلك رسالة برمز التسليم',
          ),
        ),
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
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final canUsePoints =
        _rewardsEnabled && _points >= _minOrderPoints && _quotePrice != null;
    final afterPoints = _quotePrice == null
        ? null
        : (_quotePrice! - _rewardDiscount).clamp(0, double.infinity);

    return Scaffold(
      appBar: AppBar(toolbarHeight: 0),
      bottomNavigationBar: _buildBottomAction(afterPoints),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 920),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
            children: [
              _pageIntro(),
              const SizedBox(height: 14),
              _addressCard(
                title: 'نقطة الاستلام',
                subtitle: 'من أين نستلم الطلب؟',
                icon: Icons.storefront_outlined,
                fields: _pickup,
              ),
              const SizedBox(height: 12),
              _addressCard(
                title: 'نقطة التسليم',
                subtitle: 'إلى أين نوصّل الطلب؟',
                icon: Icons.flag_outlined,
                fields: _dropoff,
              ),
              const SizedBox(height: 12),
              _packageCard(),
              const SizedBox(height: 12),
              _scheduleCard(),
              if (_loadingQuote || _quotePrice != null) ...[
                const SizedBox(height: 12),
                _quoteCard(),
              ],
              if (_rewards != null) ...[
                const SizedBox(height: 12),
                _pointsCard(canUsePoints),
              ],
              if (_usePoints && _usablePoints > 0 && afterPoints != null) ...[
                const SizedBox(height: 12),
                _discountCard(afterPoints),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _pageIntro() {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: scheme.primaryContainer.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: YallaColors.primary,
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Icon(
              Icons.delivery_dining_rounded,
              color: Colors.white,
            ),
          ),
          const SizedBox(width: 12),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'إنشاء طلب توصيل',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
                ),
                SizedBox(height: 3),
                Text(
                  'حدّد مكان الاستلام والتسليم ثم تفاصيل الشحنة.',
                  style: TextStyle(fontSize: 13),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _addressCard({
    required String title,
    required String subtitle,
    required IconData icon,
    required _AddressFields fields,
  }) {
    return _sectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _sectionHeader(title, subtitle, icon),
          const SizedBox(height: 14),
          ..._addressInputs(fields),
        ],
      ),
    );
  }

  Widget _packageCard() {
    return _sectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _sectionHeader(
            'تفاصيل الشحنة',
            'أضف وصفًا يساعد الكابتن على معرفة ما سيتم توصيله.',
            Icons.inventory_2_outlined,
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _noteController,
            minLines: 2,
            maxLines: 4,
            decoration: _inputDecoration(
              hintText: 'مثال: طرد صغير، أوراق، أغراض...',
              icon: Icons.notes_rounded,
            ),
          ),
        ],
      ),
    );
  }

  Widget _scheduleCard() {
    final scheduled = _scheduledAt != null;
    return _sectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _sectionHeader(
            'وقت التوصيل',
            scheduled
                ? 'الطلب مجدول للوقت المحدد أدناه.'
                : 'يمكنك الطلب الآن أو اختيار وقت لاحق.',
            Icons.schedule_rounded,
          ),
          const SizedBox(height: 14),
          SegmentedButton<bool>(
            segments: const [
              ButtonSegment<bool>(
                value: false,
                icon: Icon(Icons.bolt_rounded),
                label: Text('الآن'),
              ),
              ButtonSegment<bool>(
                value: true,
                icon: Icon(Icons.event_outlined),
                label: Text('جدولة'),
              ),
            ],
            selected: {scheduled},
            onSelectionChanged: (selection) async {
              if (selection.first) {
                await _pickSchedule();
              } else {
                setState(() => _scheduledAt = null);
              }
            },
          ),
          if (scheduled) ...[
            const SizedBox(height: 12),
            InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: _pickSchedule,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 12,
                ),
                decoration: BoxDecoration(
                  color: Theme.of(context)
                      .colorScheme
                      .surfaceContainerHighest
                      .withValues(alpha: 0.45),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.event_available_outlined, size: 20),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        _formatSchedule(_scheduledAt!),
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                    ),
                    const Icon(Icons.edit_outlined, size: 18),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _quoteCard() {
    return _sectionCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: YallaColors.primary.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(13),
            ),
            child: Icon(
              Icons.payments_outlined,
              color: YallaColors.primary,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _loadingQuote
                ? const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'جارٍ حساب السعر...',
                        style: TextStyle(fontWeight: FontWeight.w800),
                      ),
                      SizedBox(height: 8),
                      LinearProgressIndicator(minHeight: 3),
                    ],
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'السعر التقريبي: $_quotePrice ₪',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      if (_quoteDistance != null) ...[
                        const SizedBox(height: 5),
                        Text(
                          'المسافة ~$_quoteDistance كم'
                          '${_quoteEta != null ? ' · الزمن ~$_quoteEta دقيقة' : ''}',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                      const SizedBox(height: 4),
                      Text(
                        'السعر النهائي يحدده الكابتن عند التسليم ولا يتجاوز التقريبي.',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  Widget _pointsCard(bool canUsePoints) {
    final needsQuote = _quotePrice == null;
    final subtitle = canUsePoints
        ? 'رصيدك $_points نقطة. فعّل الخصم لاستخدام النقاط المتاحة على هذا الطلب.'
        : needsQuote
            ? 'رصيدك $_points نقطة · سيتم تفعيل الاستخدام بعد حساب السعر.'
            : 'رصيدك $_points نقطة · تحتاج $_minOrderPoints نقطة على الأقل للاستخدام.';

    return _sectionCard(
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: YallaColors.primary.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(13),
            ),
            child: Icon(
              Icons.stars_rounded,
              color: YallaColors.primary,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'نقاط Yalla',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 3),
                Text(
                  subtitle,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Switch.adaptive(
            value: _usePoints && canUsePoints,
            onChanged: canUsePoints
                ? (value) => setState(() => _usePoints = value)
                : null,
          ),
        ],
      ),
    );
  }

  Widget _discountCard(num afterPoints) {
    return _sectionCard(
      child: Column(
        children: [
          _priceRow('خصم نقاط Yalla', '-$_rewardDiscount ₪'),
          const Divider(height: 20),
          _priceRow(
            'المطلوب من المحفظة تقريبًا',
            '$afterPoints ₪',
            bold: true,
          ),
        ],
      ),
    );
  }

  Widget _buildBottomAction(num? afterPoints) {
    final scheme = Theme.of(context).colorScheme;
    final price = afterPoints ?? _quotePrice;

    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
        decoration: BoxDecoration(
          color: scheme.surface,
          border: Border(
            top: BorderSide(
              color: scheme.outlineVariant.withValues(alpha: 0.5),
            ),
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: price == null
                  ? Text(
                      _loadingQuote
                          ? 'جارٍ حساب السعر...'
                          : 'أكمل العنوانين لحساب السعر',
                      style: TextStyle(
                        fontSize: 12,
                        color: scheme.onSurfaceVariant,
                        fontWeight: FontWeight.w700,
                      ),
                    )
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          'السعر التقريبي',
                          style: TextStyle(
                            fontSize: 11,
                            color: scheme.onSurfaceVariant,
                          ),
                        ),
                        Text(
                          '$price ₪',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w900,
                            color: YallaColors.primary,
                          ),
                        ),
                      ],
                    ),
            ),
            const SizedBox(width: 12),
            SizedBox(
              height: 50,
              child: FilledButton.icon(
                onPressed: _submitting ? null : _submitOrder,
                icon: _submitting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.arrow_back_rounded),
                label: const Text(
                  'تأكيد الطلب',
                  style: TextStyle(fontWeight: FontWeight.w900),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _sectionCard({required Widget child}) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: scheme.outlineVariant.withValues(alpha: 0.7),
        ),
      ),
      child: child,
    );
  }

  Widget _sectionHeader(String title, String subtitle, IconData icon) {
    final scheme = Theme.of(context).colorScheme;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 38,
          height: 38,
          decoration: BoxDecoration(
            color: YallaColors.primary.withValues(alpha: 0.10),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, size: 21, color: YallaColors.primary),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                style: TextStyle(
                  fontSize: 12,
                  color: scheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  InputDecoration _inputDecoration({
    required String hintText,
    IconData? icon,
  }) {
    final scheme = Theme.of(context).colorScheme;
    return InputDecoration(
      hintText: hintText,
      prefixIcon: icon == null ? null : Icon(icon, size: 21),
      filled: true,
      fillColor: scheme.surfaceContainerHighest.withValues(alpha: 0.32),
      contentPadding: const EdgeInsets.symmetric(
        horizontal: 14,
        vertical: 14,
      ),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: scheme.outlineVariant),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(
          color: scheme.outlineVariant.withValues(alpha: 0.8),
        ),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(
          color: YallaColors.primary,
          width: 1.5,
        ),
      ),
    );
  }

  Widget _priceRow(String label, String value, {bool bold = false}) => Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              fontWeight: bold ? FontWeight.bold : FontWeight.normal,
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontWeight: bold ? FontWeight.bold : FontWeight.w700,
              color: YallaColors.primary,
            ),
          ),
        ],
      );

  List<Widget> _addressInputs(_AddressFields f) => [
        if (_loadingAddresses)
          const LinearProgressIndicator()
        else if (_savedAddresses.isNotEmpty && f.saved == null)
          _savedAddressPicker(f),
        if (!_loadingAddresses && _savedAddresses.isNotEmpty && f.saved == null)
          const SizedBox(height: 10),
        if (f.saved == null) ...[
          LayoutBuilder(
            builder: (context, constraints) {
              final stack = constraints.maxWidth < 520;
              if (stack) {
                return Column(
                  children: [
                    _cityPicker(f),
                    const SizedBox(height: 10),
                    _neighborhoodPicker(f),
                  ],
                );
              }
              return Row(
                children: [
                  Expanded(child: _cityPicker(f)),
                  const SizedBox(width: 10),
                  Expanded(child: _neighborhoodPicker(f)),
                ],
              );
            },
          ),
          const SizedBox(height: 10),
          TextField(
            controller: f.street,
            textInputAction: TextInputAction.next,
            decoration: _inputDecoration(
              hintText: 'الشارع ورقم المبنى',
              icon: Icons.add_road_rounded,
            ),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: f.details,
            textInputAction: TextInputAction.next,
            decoration: _inputDecoration(
              hintText: 'تفاصيل إضافية: طابق، مدخل، علامة مميزة',
              icon: Icons.location_on_outlined,
            ),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: f.note,
            decoration: _inputDecoration(
              hintText: 'ملاحظة للموقع (اختياري)',
            ),
          ),
        ] else
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: 12,
              vertical: 10,
            ),
            decoration: BoxDecoration(
              color: Theme.of(context)
                  .colorScheme
                  .surfaceContainerHighest
                  .withValues(alpha: 0.38),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.bookmark_added_outlined,
                  color: YallaColors.primary,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        (f.saved!['label'] ?? 'عنوان محفوظ').toString(),
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        (f.saved!['address'] ?? '').toString(),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
                TextButton(
                  onPressed: () {
                    setState(() => f.saved = null);
                    _addressChanged();
                  },
                  child: const Text('تغيير'),
                ),
              ],
            ),
          ),
      ];

  Widget _savedAddressPicker(_AddressFields f) =>
      DropdownButtonFormField<Map<String, dynamic>?>(
        value: null,
        isExpanded: true,
        decoration: _inputDecoration(
          hintText: 'اختر عنوانًا محفوظًا أو أدخل عنوانًا جديدًا',
          icon: Icons.bookmark_outline_rounded,
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
        decoration: _inputDecoration(
          hintText: 'المدينة',
          icon: Icons.location_city_outlined,
        ),
        items: gazaCities
            .map(
              (name) => DropdownMenuItem(
                value: name,
                child: Text(name),
              ),
            )
            .toList(),
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
      decoration: _inputDecoration(
        hintText: f.city == null ? 'اختر المدينة أولًا' : 'الحي',
        icon: Icons.holiday_village_outlined,
      ),
      items: names
          .map(
            (name) => DropdownMenuItem(
              value: name,
              child: Text(name),
            ),
          )
          .toList(),
      onChanged: f.city == null
          ? null
          : (v) {
              setState(() => f.neighborhood = v);
              _addressChanged();
            },
    );
  }

  String _formatSchedule(DateTime value) {
    final local = value.toLocal();
    final hour = local.hour.toString().padLeft(2, '0');
    final minute = local.minute.toString().padLeft(2, '0');
    return '${local.year}/${local.month}/${local.day} · $hour:$minute';
  }

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
