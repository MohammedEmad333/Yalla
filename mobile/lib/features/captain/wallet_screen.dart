// محفظة أرباح الكابتن وطلبات السحب (Card 19).
// تعرض الرصيد المتاح للسحب وسجلّ الطلبات، وتفتح نموذج سحب (المبلغ + الطريقة + الجوال).
// يُحوّل الأدمن المبلغ ثم يضغط "تم التحويل" فيُخصم من الرصيد ويصل إشعار للكابتن.

import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../../core/realtime/socket_service.dart';
import '../../core/theme/app_theme.dart';

// طرق السحب المتاحة (تطابق WITHDRAWAL_METHOD في الخادم)
const Map<String, String> _methods = {
  'jawwal_pay': 'جوال باي',
  'bank_of_palestine': 'بنك فلسطين',
  'palpay': 'بال باي',
  'cash': 'نقدًا',
};

class CaptainWalletScreen extends StatefulWidget {
  final ApiClient api;
  final SocketService socket;
  const CaptainWalletScreen({super.key, required this.api, required this.socket});

  @override
  State<CaptainWalletScreen> createState() => _CaptainWalletScreenState();
}

class _CaptainWalletScreenState extends State<CaptainWalletScreen> {
  Map<String, dynamic> _balance = {};
  List<dynamic> _withdrawals = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
    // تحديث الرصيد لحظيًا بعد تنفيذ الأدمن للسحب
    widget.socket.onCaptainWalletUpdated((data) {
      if (!mounted) return;
      setState(() => _balance = data);
      _load();
    });
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        widget.api.get('/captains/me/balance'),
        widget.api.get('/captains/me/withdrawals'),
      ]);
      if (!mounted) return;
      setState(() {
        _balance = Map<String, dynamic>.from(results[0] as Map);
        _withdrawals = results[1] as List;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      _snack(e.message);
    }
  }

  num get _available => (_balance['available'] as num?) ?? 0;

  Future<void> _openWithdrawForm() async {
    if (_available < 10) {
      _snack('الحدّ الأدنى للسحب ١٠ ₪');
      return;
    }
    final done = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _WithdrawForm(api: widget.api, available: _available),
    );
    if (done == true) _load();
  }

  void _snack(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('محفظتي')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _balanceCard(),
            const SizedBox(height: 20),
            Text('طلبات السحب',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            if (_loading)
              const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()))
            else if (_withdrawals.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 32),
                child: Center(child: Text('لا توجد طلبات سحب بعد', style: TextStyle(color: YallaColors.muted))),
              )
            else
              ..._withdrawals.map(_withdrawalTile),
          ],
        ),
      ),
    );
  }

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
          const Text('الرصيد المتاح للسحب', style: TextStyle(color: Colors.white70, fontSize: 14)),
          const SizedBox(height: 8),
          Text('$_available ₪',
              style: const TextStyle(color: Colors.white, fontSize: 36, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Row(
            children: [
              _miniStat('إجمالي الأرباح', _balance['earned']),
              const SizedBox(width: 16),
              _miniStat('قيد التحويل', _balance['pending']),
            ],
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              style: FilledButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: YallaColors.primaryDeep,
              ),
              onPressed: _openWithdrawForm,
              icon: const Icon(Icons.account_balance),
              label: const Text('سحب الأموال'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _miniStat(String label, dynamic value) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(color: Colors.white60, fontSize: 11)),
          Text('${value ?? 0} ₪', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
        ],
      );

  Widget _withdrawalTile(dynamic w) {
    final status = w['status'] as String? ?? 'pending';
    final (label, color) = _statusMeta(status);
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
          child: Icon(Icons.payments, color: color),
        ),
        title: Text('${w['amount'] ?? 0} ₪', style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text('${_methods[w['method']] ?? w['method'] ?? ''} · ${w['phone'] ?? ''}',
            style: const TextStyle(color: YallaColors.muted, fontSize: 12)),
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

  (String, Color) _statusMeta(String s) => switch (s) {
        'pending' => ('قيد التحويل', YallaColors.statusInTransit),
        'done' => ('تم التحويل', YallaColors.success),
        'rejected' => ('مرفوض', YallaColors.error),
        _ => (s, YallaColors.muted),
      };
}

// نموذج طلب سحب (المبلغ + الطريقة + رقم الجوال)
class _WithdrawForm extends StatefulWidget {
  final ApiClient api;
  final num available;
  const _WithdrawForm({required this.api, required this.available});

  @override
  State<_WithdrawForm> createState() => _WithdrawFormState();
}

class _WithdrawFormState extends State<_WithdrawForm> {
  final _amount = TextEditingController();
  final _phone = TextEditingController();
  String _method = 'jawwal_pay';
  bool _submitting = false;

  Future<void> _submit() async {
    final amount = num.tryParse(_amount.text.trim());
    if (amount == null || amount < 10) {
      _snack('الحدّ الأدنى للسحب ١٠ ₪');
      return;
    }
    if (amount > widget.available) {
      _snack('المبلغ يتجاوز الرصيد المتاح (${widget.available} ₪)');
      return;
    }
    if (_phone.text.trim().length < 6) {
      _snack('أدخل رقم جوال صحيح');
      return;
    }
    setState(() => _submitting = true);
    try {
      await widget.api.post('/captains/me/withdrawals', {
        'amount': amount,
        'method': _method,
        'phone': _phone.text.trim(),
      });
      if (!mounted) return;
      Navigator.pop(context, true);
    } on ApiException catch (e) {
      _snack(e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _snack(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('سحب الأموال', style: Theme.of(context).textTheme.titleLarge),
          Text('المتاح: ${widget.available} ₪', style: const TextStyle(color: YallaColors.muted)),
          const SizedBox(height: 16),
          TextField(
            controller: _amount,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'المبلغ (₪)',
              prefixIcon: Icon(Icons.payments),
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: _method,
            decoration: const InputDecoration(
              labelText: 'طريقة السحب',
              prefixIcon: Icon(Icons.account_balance_wallet),
              border: OutlineInputBorder(),
            ),
            items: _methods.entries
                .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
                .toList(),
            onChanged: (v) => setState(() => _method = v ?? _method),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'رقم الجوال لاستلام التحويل',
              prefixIcon: Icon(Icons.phone),
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _submitting ? null : _submit,
              icon: _submitting
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.send),
              label: const Text('إرسال طلب السحب'),
            ),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _amount.dispose();
    _phone.dispose();
    super.dispose();
  }
}
