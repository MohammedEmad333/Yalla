import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../../core/widgets/input_behavior.dart';

class RewardsIssuesScreen extends StatefulWidget {
  final ApiClient api;
  const RewardsIssuesScreen({super.key, required this.api});

  @override
  State<RewardsIssuesScreen> createState() => _RewardsIssuesScreenState();
}

class _RewardsIssuesScreenState extends State<RewardsIssuesScreen> {
  Map<String, dynamic>? _rewards;
  List<dynamic> _issues = [];
  List<dynamic> _orders = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        widget.api.get('/expansion/rewards'),
        widget.api.get('/expansion/issues'),
        widget.api.get('/orders/mine'),
      ]);
      if (!mounted) return;
      setState(() {
        _rewards = Map<String, dynamic>.from(results[0] as Map);
        _issues = results[1] as List;
        _orders = results[2] as List;
      });
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _applyReferral() async {
    final c = TextEditingController();
    final code = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('رمز دعوة'),
        content: TextField(controller: c, textCapitalization: TextCapitalization.characters, textDirection: YallaInputBehavior.machineDirection, textAlign: YallaInputBehavior.machineAlign, decoration: const InputDecoration(labelText: 'الرمز')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('إلغاء')),
          FilledButton(onPressed: () => Navigator.pop(ctx, c.text.trim()), child: const Text('تطبيق')),
        ],
      ),
    );
    if (code == null || code.isEmpty) return;
    try {
      await widget.api.post('/expansion/referrals/apply', {'code': code});
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('تم حفظ رمز الدعوة. تُضاف المكافأة بعد إكمال أول طلب.')),
        );
      }
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _newIssue() async {
    if (_orders.isEmpty) return;
    String? orderId = (_orders.first as Map)['_id']?.toString();
    String type = 'other';
    final desc = TextEditingController();
    final refund = TextEditingController();
    final sent = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: const Text('الإبلاغ عن مشكلة'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              DropdownButtonFormField<String>(
                value: orderId,
                decoration: const InputDecoration(labelText: 'الطلب'),
                items: _orders.take(30).map((raw) {
                  final o = raw as Map;
                  final id = o['_id']?.toString() ?? '';
                  final short = id.length > 5 ? id.substring(id.length - 5) : id;
                  return DropdownMenuItem(value: id, child: Text('#$short · ${o['store']?['name'] ?? 'توصيل'}'));
                }).toList(),
                onChanged: (v) => setLocal(() => orderId = v),
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                value: type,
                decoration: const InputDecoration(labelText: 'نوع المشكلة'),
                items: const [
                  DropdownMenuItem(value: 'missing_item', child: Text('صنف ناقص')),
                  DropdownMenuItem(value: 'wrong_item', child: Text('صنف خاطئ')),
                  DropdownMenuItem(value: 'quality', child: Text('جودة')),
                  DropdownMenuItem(value: 'late', child: Text('تأخير')),
                  DropdownMenuItem(value: 'captain', child: Text('الكابتن')),
                  DropdownMenuItem(value: 'payment', child: Text('الدفع')),
                  DropdownMenuItem(value: 'other', child: Text('أخرى')),
                ],
                onChanged: (v) => setLocal(() => type = v ?? 'other'),
              ),
              const SizedBox(height: 10),
              TextField(controller: desc, maxLines: 3, decoration: const InputDecoration(labelText: 'اشرح المشكلة')),
              const SizedBox(height: 10),
              TextField(controller: refund, keyboardType: TextInputType.number, textDirection: YallaInputBehavior.machineDirection, textAlign: YallaInputBehavior.machineAlign, decoration: const InputDecoration(labelText: 'قيمة الاسترداد المطلوبة (اختياري)')),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('إرسال')),
          ],
        ),
      ),
    );
    if (sent != true || orderId == null) return;
    try {
      await widget.api.post('/expansion/issues', {
        'orderId': orderId,
        'type': type,
        'description': desc.text.trim(),
        'requestedRefund': num.tryParse(refund.text.trim()) ?? 0,
      });
      await _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final points = NumberUtil.asInt(_rewards?['points']);
    final valueIls = NumberUtil.asInt(_rewards?['valueIls']);
    final hasReferral = _rewards?['hasReferral'] == true;
    final referralRewarded = _rewards?['referralRewarded'] == true;
    final rules = Map<String, dynamic>.from((_rewards?['rules'] as Map?) ?? const {});
    final rewardPoints = NumberUtil.asInt(rules['referralRewardPoints'], fallback: 100);
    final pointsPerIls = NumberUtil.asInt(rules['pointsPerIls'], fallback: 100);
    final minOrder = NumberUtil.asInt(rules['minOrderPoints'] ?? rules['minRedeemPoints'], fallback: pointsPerIls);

    return Scaffold(
      appBar: AppBar(title: const Text('مكافآتي ومشاكلي')),
      floatingActionButton: FloatingActionButton.extended(onPressed: _newIssue, icon: const Icon(Icons.report_problem_outlined), label: const Text('مشكلة جديدة')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('نقاط Yalla', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 8),
                  Text('$points نقطة', style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w900)),
                  Text('قيمة خصم متاحة: $valueIls ₪ · كل $pointsPerIls نقطة = 1 ₪'),
                  const SizedBox(height: 12),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.primaryContainer.withValues(alpha: .45),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.shopping_bag_outlined),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            'يمكن استخدام النقاط فقط كخصم عند تأكيد طلب توصيل أو طلب من متجر. لا يمكن تحويلها إلى المحفظة أو سحبها.${minOrder > 0 ? '\nالحد الأدنى للاستخدام: $minOrder نقطة.' : ''}',
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Divider(height: 28),
                  SelectableText('رمز دعوتك: ${_rewards?['referralCode'] ?? '-'}', style: const TextStyle(fontWeight: FontWeight.w800)),
                  Text('عدد الأشخاص الذين استخدموا دعوتك: ${_rewards?['referred'] ?? 0}'),
                  const SizedBox(height: 8),
                  Text('مكافأة الدعوة: $rewardPoints نقطة لك ولصديقك بعد إكمال أول طلب بنجاح.'),
                  if (hasReferral && !referralRewarded)
                    const Padding(
                      padding: EdgeInsets.only(top: 6),
                      child: Text('تم حفظ رمز الدعوة، والمكافأة بانتظار إكمال أول طلب.', style: TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  const SizedBox(height: 10),
                  if (!hasReferral)
                    OutlinedButton.icon(onPressed: _applyReferral, icon: const Icon(Icons.group_add_outlined), label: const Text('لدي رمز دعوة')),
                ]),
              ),
            ),
            const SizedBox(height: 18),
            const Text('الشكاوى والاستردادات', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
            const SizedBox(height: 8),
            if (_issues.isEmpty)
              const Card(child: Padding(padding: EdgeInsets.all(20), child: Text('لا توجد شكاوى مفتوحة أو سابقة.')))
            else
              ..._issues.map((raw) {
                final x = raw as Map;
                return Card(
                  child: ListTile(
                    leading: Icon(x['status'] == 'resolved' ? Icons.check_circle_outline : Icons.support_agent),
                    title: Text(x['description']?.toString() ?? ''),
                    subtitle: Text('الحالة: ${x['status']} · المطلوب ${x['requestedRefund'] ?? 0} ₪ · المعتمد ${x['approvedRefund'] ?? 0} ₪'),
                  ),
                );
              }),
          ],
        ),
      ),
    );
  }
}

class NumberUtil {
  static int asInt(dynamic value, {int fallback = 0}) {
    if (value is num) return value.toInt();
    return int.tryParse(value?.toString() ?? '') ?? fallback;
  }
}
