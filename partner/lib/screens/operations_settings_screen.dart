import 'package:flutter/material.dart';

import '../core/api_client.dart';
import 'inventory_screen.dart';
import 'staff_screen.dart';

class OperationsSettingsScreen extends StatefulWidget {
  final ApiClient api;
  const OperationsSettingsScreen({super.key, required this.api});

  @override
  State<OperationsSettingsScreen> createState() => _OperationsSettingsScreenState();
}

class _OperationsSettingsScreenState extends State<OperationsSettingsScreen> {
  Map<String, dynamic> _restaurant = {};
  bool _loading = true;
  bool _saving = false;
  bool _isOpen = true;
  int _busyExtra = 0;
  DateTime? _busyUntil;
  bool _promoActive = false;
  final _promoTitle = TextEditingController();
  final _promoPercent = TextEditingController();
  final _promoMinOrder = TextEditingController();
  final List<Map<String, dynamic>> _hours = List.generate(7, (i) => {'day': i, 'open': '09:00', 'close': '23:00', 'closed': false});

  static const _dayNames = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

  @override
  void initState() { super.initState(); _load(); }

  @override
  void dispose() {
    _promoTitle.dispose();
    _promoPercent.dispose();
    _promoMinOrder.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final data = await widget.api.get('/merchant/profile');
      final r = Map<String, dynamic>.from(data['restaurant'] as Map);
      _restaurant = r;
      _isOpen = r['isOpen'] != false;
      _busyExtra = ((r['busyExtraPrepMinutes'] as num?) ?? 0).toInt();
      final rawUntil = r['busyUntil']?.toString();
      _busyUntil = rawUntil == null || rawUntil.isEmpty ? null : DateTime.tryParse(rawUntil)?.toLocal();
      final promo = r['promotion'] is Map ? Map<String, dynamic>.from(r['promotion'] as Map) : <String, dynamic>{};
      _promoActive = promo['active'] == true;
      _promoTitle.text = promo['title']?.toString() ?? '';
      _promoPercent.text = promo['percent']?.toString() ?? '0';
      _promoMinOrder.text = promo['minOrder']?.toString() ?? '0';
      final weekly = (r['weeklyHours'] as List?) ?? const [];
      for (final raw in weekly) {
        final row = Map<String, dynamic>.from(raw as Map);
        final day = ((row['day'] as num?) ?? -1).toInt();
        if (day >= 0 && day < 7) _hours[day] = {'day': day, 'open': row['open'] ?? '', 'close': row['close'] ?? '', 'closed': row['closed'] == true};
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _setBusy(Duration? duration) async {
    setState(() {
      _busyUntil = duration == null ? null : DateTime.now().add(duration);
      _busyExtra = duration == null ? 0 : (_busyExtra == 0 ? 15 : _busyExtra);
    });
    await _save();
  }

  Future<void> _editDay(int index) async {
    final row = _hours[index];
    final open = TextEditingController(text: row['open']?.toString() ?? '09:00');
    final close = TextEditingController(text: row['close']?.toString() ?? '23:00');
    var closed = row['closed'] == true;
    final ok = await showDialog<bool>(context: context, builder: (ctx) => StatefulBuilder(builder: (ctx, local) => AlertDialog(
      title: Text(_dayNames[index]),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        SwitchListTile.adaptive(contentPadding: EdgeInsets.zero, value: closed, onChanged: (v) => local(() => closed = v), title: const Text('مغلق طوال اليوم')),
        if (!closed) ...[
          TextField(controller: open, textDirection: TextDirection.ltr, decoration: const InputDecoration(labelText: 'فتح HH:MM')),
          const SizedBox(height: 8),
          TextField(controller: close, textDirection: TextDirection.ltr, decoration: const InputDecoration(labelText: 'إغلاق HH:MM')),
        ],
      ]),
      actions: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')), FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('حفظ'))],
    )));
    if (ok == true) setState(() => _hours[index] = {'day': index, 'open': open.text.trim(), 'close': close.text.trim(), 'closed': closed});
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final saved = await widget.api.patch('/merchant/restaurant', {
        'isOpen': _isOpen,
        'busyUntil': _busyUntil?.toUtc().toIso8601String() ?? '',
        'busyExtraPrepMinutes': _busyExtra,
        'weeklyHours': _hours,
        'promotion': {
          'active': _promoActive,
          'title': _promoTitle.text.trim(),
          'percent': double.tryParse(_promoPercent.text) ?? 0,
          'minOrder': double.tryParse(_promoMinOrder.text) ?? 0,
        },
      });
      if (mounted) {
        setState(() => _restaurant = Map<String, dynamic>.from(saved as Map));
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم حفظ إعدادات التشغيل')));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final busy = _busyUntil != null && _busyUntil!.isAfter(DateTime.now());
    return Scaffold(
      appBar: AppBar(title: const Text('تشغيل المتجر')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Card(child: Column(children: [
          SwitchListTile.adaptive(value: _isOpen, onChanged: (v) => setState(() => _isOpen = v), title: const Text('استقبال الطلبات', style: TextStyle(fontWeight: FontWeight.w900)), subtitle: Text(_isOpen ? 'المتجر مفتوح لاستقبال الطلبات' : 'المتجر مغلق يدويًا')),
          const Divider(height: 1),
          ListTile(leading: const Icon(Icons.local_fire_department_outlined), title: const Text('وضع مشغول'), subtitle: Text(busy ? 'مفعّل حتى ${TimeOfDay.fromDateTime(_busyUntil!).format(context)} · +$_busyExtra دقيقة' : 'غير مفعّل')),
          Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 14), child: Wrap(spacing: 8, children: [
            OutlinedButton(onPressed: () => _setBusy(const Duration(minutes: 30)), child: const Text('30 دقيقة')),
            OutlinedButton(onPressed: () => _setBusy(const Duration(hours: 1)), child: const Text('ساعة')),
            if (busy) TextButton(onPressed: () => _setBusy(null), child: const Text('إنهاء الانشغال')),
          ])),
          Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 16), child: TextField(keyboardType: TextInputType.number, controller: TextEditingController(text: '$_busyExtra'), onChanged: (v) => _busyExtra = int.tryParse(v) ?? 0, decoration: const InputDecoration(labelText: 'دقائق تحضير إضافية أثناء الانشغال'))),
        ])),
        const SizedBox(height: 12),
        Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('عرض المتجر', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
          SwitchListTile.adaptive(contentPadding: EdgeInsets.zero, value: _promoActive, onChanged: (v) => setState(() => _promoActive = v), title: const Text('تفعيل العرض')),
          TextField(controller: _promoTitle, decoration: const InputDecoration(labelText: 'عنوان العرض', hintText: 'خصم نهاية الأسبوع')),
          const SizedBox(height: 8),
          Row(children: [Expanded(child: TextField(controller: _promoPercent, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'الخصم %'))), const SizedBox(width: 8), Expanded(child: TextField(controller: _promoMinOrder, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'أقل طلب ₪')))]),
        ]))),
        const SizedBox(height: 12),
        Card(child: Column(children: [
          const ListTile(title: Text('ساعات العمل الأسبوعية', style: TextStyle(fontWeight: FontWeight.w900)), subtitle: Text('حدد ساعات مختلفة لكل يوم')),
          ...List.generate(7, (i) {
            final r = _hours[i];
            return ListTile(title: Text(_dayNames[i]), subtitle: Text(r['closed'] == true ? 'مغلق' : '${r['open']} - ${r['close']}'), trailing: const Icon(Icons.edit_outlined), onTap: () => _editDay(i));
          }),
        ])),
        const SizedBox(height: 12),
        Card(child: Column(children: [
          ListTile(leading: const Icon(Icons.inventory_2_outlined), title: const Text('المخزون والتنبيهات'), subtitle: const Text('تابع الأصناف المنخفضة أو النافدة'), trailing: const Icon(Icons.chevron_left), onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => InventoryScreen(api: widget.api)))),
          const Divider(height: 1),
          ListTile(leading: const Icon(Icons.badge_outlined), title: const Text('الموظفون والصلاحيات'), subtitle: const Text('Owner / Manager / Cashier'), trailing: const Icon(Icons.chevron_left), onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => StaffScreen(api: widget.api)))),
        ])),
        const SizedBox(height: 16),
        FilledButton.icon(onPressed: _saving ? null : _save, icon: const Icon(Icons.save_outlined), label: Text(_saving ? 'جارٍ الحفظ...' : 'حفظ إعدادات التشغيل')),
      ]),
    );
  }
}
