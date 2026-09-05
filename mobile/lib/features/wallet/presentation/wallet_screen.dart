// شاشة المحفظة (تطبيق المستخدم) — تعرض الرصيد الحالي وسجلّ الحركات،
// وتفتح شاشة شحن الرصيد. تستقبل تحديث الرصيد لحظيًا عبر السوكت.

import 'package:flutter/material.dart';

import '../../../core/network/api_client.dart';
import '../../../core/realtime/socket_service.dart';
import '../../../core/theme/app_theme.dart';
import '../data/wallet_repository.dart';
import 'topup_screen.dart';
import 'withdraw_screen.dart';

class WalletScreen extends StatefulWidget {
  final ApiClient api;
  final SocketService socket;
  const WalletScreen({super.key, required this.api, required this.socket});

  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  late final WalletRepository _repo = WalletRepository(widget.api);

  num _balance = 0;
  String _currency = 'ILS';
  List<dynamic> _transactions = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
    // تحديث الرصيد فور موافقة الأدمن (بثّ لحظي)
    widget.socket.onWalletUpdated((data) {
      if (!mounted) return;
      if (data['balance'] != null) {
        setState(() => _balance = data['balance'] as num);
      }
      _load(); // إعادة تحميل الحركات لعكس الحالة الجديدة
    });
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait([
        _repo.getBalance(),
        _repo.getTransactions(),
      ]);
      if (!mounted) return;
      final balance = results[0] as Map<String, dynamic>;
      setState(() {
        _balance = balance['balance'] as num? ?? 0;
        _currency = balance['currency'] as String? ?? 'ILS';
        _transactions = results[1] as List;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  // فتح شاشة الشحن ثم إعادة التحميل عند نجاح إرسال الطلب
  Future<void> _openTopup() async {
    final done = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => TopupScreen(api: widget.api)),
    );
    if (done == true) _load();
  }

  // Card 98: فتح شاشة سحب الرصيد ثم إعادة التحميل عند نجاح إرسال الطلب
  Future<void> _openWithdraw() async {
    final done = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => WithdrawScreen(api: widget.api)),
    );
    if (done == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('المحفظة')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _balanceCard(),
            const SizedBox(height: 20),
            Text('سجلّ العمليات',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            if (_loading)
              const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()))
            else if (_transactions.isEmpty)
              _emptyState()
            else
              ..._transactions.map(_txTile),
          ],
        ),
      ),
    );
  }

  // بطاقة الرصيد + زرّ الشحن
  Widget _balanceCard() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [YallaColors.primary, YallaColors.primaryDeep],
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
        ),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('رصيدك الحالي', style: TextStyle(color: Colors.white70, fontSize: 14)),
          const SizedBox(height: 8),
          Text('$_balance ₪',
              style: const TextStyle(color: Colors.white, fontSize: 36, fontWeight: FontWeight.w800)),
          Text(_currency, style: const TextStyle(color: Colors.white60, fontSize: 12)),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: YallaColors.primaryDeep,
                  ),
                  onPressed: _openTopup,
                  icon: const Icon(Icons.add),
                  label: const Text('شحن الرصيد'),
                ),
              ),
              const SizedBox(width: 10),
              // Card 98: زرّ سحب الرصيد
              Expanded(
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: const BorderSide(color: Colors.white70),
                  ),
                  onPressed: _openWithdraw,
                  icon: const Icon(Icons.account_balance_outlined),
                  label: const Text('سحب الرصيد'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // بطاقة حركة واحدة
  Widget _txTile(dynamic tx) {
    final amount = tx['amount'] ?? 0;
    final status = tx['status'] as String? ?? 'pending';
    // Card 28: نصف الحركة حسب نوعها لا حسب طريقة الدفع فقط، حتى لا يظهر
    // خصمُ قيمة طلبٍ على أنه «شحن رصيد».
    final desc = _txDescription(tx['type'] as String?, tx['method'] as String?);
    final (label, color) = _statusMeta(status);
    final isCredit = (tx['direction'] as String?) == 'credit';
    // Card 106: سبب رفض طلب الشحن يظهر في التطبيق أسفل وصف الحركة
    final reason = (tx['rejectionReason'] as String?)?.trim() ?? '';
    final showReason = status == 'rejected' && reason.isNotEmpty;

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: YallaColors.outline),
      ),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: color.withValues(alpha: 0.12),
          child: Icon(isCredit ? Icons.arrow_downward : Icons.arrow_upward, color: color),
        ),
        title: Text('${isCredit ? '+' : '-'}$amount ₪',
            style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: showReason
            ? Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(desc, style: const TextStyle(color: YallaColors.muted, fontSize: 12)),
                  const SizedBox(height: 2),
                  Text('سبب الرفض: $reason',
                      style: const TextStyle(color: YallaColors.error, fontSize: 12)),
                ],
              )
            : Text(desc, style: const TextStyle(color: YallaColors.muted, fontSize: 12)),
        isThreeLine: showReason,
        trailing: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(label, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
        ),
      ),
    );
  }

  Widget _emptyState() => const Padding(
        padding: EdgeInsets.symmetric(vertical: 40),
        child: Column(
          children: [
            Icon(Icons.account_balance_wallet_outlined, size: 56, color: YallaColors.muted),
            SizedBox(height: 12),
            Text('لا توجد عمليات بعد', style: TextStyle(color: YallaColors.muted)),
          ],
        ),
      );

  // وصف الحركة حسب نوعها (Card 28): خصم قيمة طلب لا يُعرض كـ«شحن رصيد».
  String _txDescription(String? type, String? method) => switch (type) {
        'order_payment' => 'دفع قيمة طلب',
        'refund' => 'استرداد رصيد',
        'adjustment' => 'تعديل رصيد',
        'withdrawal' => 'سحب رصيد',
        // شحن رصيد: نعرض طريقة الدفع إن توفّرت
        _ => _methodLabel(method),
      };

  String _methodLabel(String? m) => switch (m) {
        'bank_of_palestine' => 'شحن رصيد · بنك فلسطين',
        'jawwal_pay' => 'شحن رصيد · جوال باي',
        'palpay' => 'شحن رصيد · بال باي',
        _ => 'شحن رصيد',
      };

  (String, Color) _statusMeta(String s) => switch (s) {
        'pending' => ('قيد المراجعة', YallaColors.statusInTransit),
        'approved' => ('مقبولة', YallaColors.success),
        'rejected' => ('مرفوضة', YallaColors.error),
        _ => (s, YallaColors.muted),
      };
}
