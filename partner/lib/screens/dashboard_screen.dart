import 'package:flutter/material.dart';

import '../core/api_client.dart';

class PartnerDashboardScreen extends StatefulWidget {
  final ApiClient api;
  const PartnerDashboardScreen({super.key, required this.api});

  @override
  State<PartnerDashboardScreen> createState() => _PartnerDashboardScreenState();
}

class _PartnerDashboardScreenState extends State<PartnerDashboardScreen> {
  bool loading = true;
  String? error;
  Map<String, dynamic> analytics = {};
  Map<String, dynamic> finance = {};
  bool? isOpen;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { loading = true; error = null; });
    try {
      final a = await widget.api.get('/features/merchant/analytics');
      final f = await widget.api.get('/features/merchant/finance');
      final p = await widget.api.get('/merchant/profile');
      final restaurant = p is Map && p['restaurant'] is Map ? Map<String, dynamic>.from(p['restaurant']) : <String, dynamic>{};
      if (!mounted) return;
      setState(() {
        analytics = a is Map ? Map<String, dynamic>.from(a) : {};
        finance = f is Map ? Map<String, dynamic>.from(f) : {};
        isOpen = restaurant['isOpen'] != false;
      });
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  num _n(dynamic value) => value is num ? value : num.tryParse('$value') ?? 0;

  Future<void> _toggleOpen(bool value) async {
    final old = isOpen;
    setState(() => isOpen = value);
    try {
      await widget.api.patch('/features/merchant/open', {'isOpen': value});
    } catch (e) {
      if (!mounted) return;
      setState(() => isOpen = old);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<void> _requestSettlement() async {
    final controller = TextEditingController(text: '${_n(finance['available'])}');
    final amount = await showDialog<double>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('طلب سحب مستحقات'),
        content: TextField(
          controller: controller,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: const InputDecoration(labelText: 'المبلغ بالشيكل'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('إلغاء')),
          FilledButton(
            onPressed: () => Navigator.pop(context, double.tryParse(controller.text)),
            child: const Text('إرسال'),
          ),
        ],
      ),
    );
    if (amount == null || amount <= 0) return;
    try {
      await widget.api.post('/features/merchant/settlements', {'amount': amount, 'method': 'cash'});
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم إرسال طلب السحب')));
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Widget _stat(String label, dynamic value, IconData icon) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, size: 22),
          const SizedBox(height: 10),
          Text('$value', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
          const SizedBox(height: 3),
          Text(label, style: const TextStyle(color: Color(0xFF7A8595))),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (loading) return const Center(child: CircularProgressIndicator());
    if (error != null) return Center(child: FilledButton(onPressed: _load, child: Text('إعادة المحاولة\n$error')));

    final today = analytics['today'] is Map ? Map<String, dynamic>.from(analytics['today']) : <String, dynamic>{};
    final week = analytics['week'] is Map ? Map<String, dynamic>.from(analytics['week']) : <String, dynamic>{};
    final top = analytics['topItems'] is List ? List<dynamic>.from(analytics['topItems']) : <dynamic>[];

    return RefreshIndicator(
      onRefresh: _load,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final wide = constraints.maxWidth >= 900;
          final stats = [
            _stat('طلبات اليوم', _n(today['orders']).toInt(), Icons.receipt_long_rounded),
            _stat('مبيعات اليوم', '${_n(today['sales']).toStringAsFixed(2)} ₪', Icons.payments_rounded),
            _stat('آخر 7 أيام', _n(week['orders']).toInt(), Icons.calendar_view_week_rounded),
            _stat('مبيعات 7 أيام', '${_n(week['sales']).toStringAsFixed(2)} ₪', Icons.trending_up_rounded),
          ];

          final financeCard = Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                const Text('المستحقات', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
                const SizedBox(height: 12),
                Text('إجمالي مبيعات الأصناف: ${_n(finance['gross']).toStringAsFixed(2)} ₪'),
                Text('مدفوع: ${_n(finance['paid']).toStringAsFixed(2)} ₪'),
                Text('قيد المراجعة: ${_n(finance['pending']).toStringAsFixed(2)} ₪'),
                const SizedBox(height: 8),
                Text('متاح للسحب: ${_n(finance['available']).toStringAsFixed(2)} ₪', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: _n(finance['available']) > 0 ? _requestSettlement : null,
                  icon: const Icon(Icons.account_balance_wallet_rounded),
                  label: const Text('طلب سحب المستحقات'),
                ),
              ]),
            ),
          );

          final topCard = Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('الأكثر مبيعًا', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
                const SizedBox(height: 8),
                if (top.isEmpty) const Text('لا توجد بيانات كافية بعد')
                else ...top.map((row) {
                  final m = row is Map ? row : {};
                  return ListTile(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    title: Text('${m['_id'] ?? 'صنف'}'),
                    trailing: Text('${m['qty'] ?? 0} طلب'),
                  );
                }),
              ]),
            ),
          );

          return ListView(
            padding: EdgeInsets.all(wide ? 24 : 16),
            children: [
              Card(
                child: SwitchListTile.adaptive(
                  title: Text(
                    isOpen == true ? 'المتجر مفتوح' : 'المتجر مغلق مؤقتًا',
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                  subtitle: const Text('يمكنك إيقاف استقبال الطلبات وإعادتها في أي وقت'),
                  value: isOpen == true,
                  onChanged: _toggleOpen,
                  secondary: Icon(
                    isOpen == true ? Icons.storefront_rounded : Icons.storefront_outlined,
                  ),
                ),
              ),
              const SizedBox(height: 16),
              GridView.count(
                crossAxisCount: wide ? 4 : 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: wide ? 1.7 : 1.25,
                children: stats,
              ),
              const SizedBox(height: 16),
              if (wide)
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(flex: 5, child: financeCard),
                    const SizedBox(width: 16),
                    Expanded(flex: 4, child: topCard),
                  ],
                )
              else ...[
                financeCard,
                const SizedBox(height: 12),
                topCard,
              ],
            ],
          );
        },
      ),
    );
  }
}
