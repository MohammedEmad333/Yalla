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
  'all': 'الكل',
  'cash': 'نقدًا',
};

// تصنيفات المحفظة الإلكترونية المحفوظة (Card 67) — تطابق PAYOUT_WALLET_CATEGORY.
// تشمل خيار "الكل" لرقم واحد صالح لكل الطرق.
const Map<String, String> _walletCategories = {
  'bank_of_palestine': 'بنك فلسطين',
  'palpay': 'محفظة بال باي',
  'jawwal_pay': 'جوال باي',
  'all': 'الكل',
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
  List<dynamic> _payoutWallets = []; // المحافظ الإلكترونية المحفوظة (Card 67)
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
        widget.api.get('/captains/me/payout-wallets'),
      ]);
      if (!mounted) return;
      setState(() {
        _balance = Map<String, dynamic>.from(results[0] as Map);
        _withdrawals = results[1] as List;
        _payoutWallets = results[2] as List;
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
    // Card 71: طريقة السحب تعرض محافظ الكابتن الإلكترونية المضافة فقط.
    // إن لم يُضِف أي محفظة نوجّهه لإضافتها أولًا.
    if (_payoutWallets.isEmpty) {
      final add = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          icon: const Icon(Icons.account_balance_wallet, color: YallaColors.primary, size: 36),
          title: const Text('أضِف محفظتك الإلكترونية'),
          content: const Text(
            'لسحب أموالك أضِف محفظة إلكترونية واحدة على الأقلّ (رقم المحفظة واسم صاحبها) '
            'لتختارها كطريقة للسحب.',
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('لاحقًا')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('إضافة محفظة')),
          ],
        ),
      );
      if (add == true) _openWalletsForm();
      return;
    }
    final done = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _WithdrawForm(
        api: widget.api,
        available: _available,
        wallets: _payoutWallets,
      ),
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
            _payoutWalletsCard(),
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

  // Card 67: بطاقة المحافظ الإلكترونية المحفوظة — رقم المحفظة واسم صاحبها لكل
  // تصنيف، مع زر لإدارتها. يعرفها الأدمن عند تحويل أموال الكابتن.
  Widget _payoutWalletsCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: YallaColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: YallaColors.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.account_balance_wallet, color: YallaColors.primary),
              const SizedBox(width: 8),
              const Expanded(
                child: Text('محافظي الإلكترونية',
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              ),
              TextButton.icon(
                onPressed: _openWalletsForm,
                icon: const Icon(Icons.edit, size: 18),
                label: const Text('إدارة'),
              ),
            ],
          ),
          const SizedBox(height: 4),
          if (_payoutWallets.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 10),
              child: Text(
                'أضِف رقم محفظتك الإلكترونية واسم صاحبها ليحوّل لك الأدمن أموالك بسهولة.',
                style: TextStyle(color: YallaColors.muted, fontSize: 13),
              ),
            )
          else
            ..._payoutWallets.map((w) {
              final cat = w['category'] as String? ?? '';
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: YallaColors.primary.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(_walletCategories[cat] ?? cat,
                          style: const TextStyle(
                              color: YallaColors.primaryDeep, fontSize: 12, fontWeight: FontWeight.w600)),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${w['number'] ?? ''}',
                              style: const TextStyle(fontWeight: FontWeight.w600)),
                          if ((w['ownerName'] as String?)?.isNotEmpty ?? false)
                            Text('${w['ownerName']}',
                                style: const TextStyle(color: YallaColors.muted, fontSize: 12)),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }

  Future<void> _openWalletsForm() async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _PayoutWalletsForm(api: widget.api, initial: _payoutWallets),
    );
    if (saved == true) _load();
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

// نموذج طلب سحب (المبلغ + طريقة السحب من محافظ الكابتن المضافة — Card 71)
class _WithdrawForm extends StatefulWidget {
  final ApiClient api;
  final num available;
  final List<dynamic> wallets; // المحافظ الإلكترونية المحفوظة للكابتن
  const _WithdrawForm({required this.api, required this.available, required this.wallets});

  @override
  State<_WithdrawForm> createState() => _WithdrawFormState();
}

class _WithdrawFormState extends State<_WithdrawForm> {
  final _amount = TextEditingController();
  String? _walletCategory; // تصنيف المحفظة المختارة كطريقة للسحب
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    // نبدأ باختيار أول محفظة مضافة كطريقة افتراضية للسحب
    if (widget.wallets.isNotEmpty) {
      _walletCategory = widget.wallets.first['category'] as String?;
    }
    // تحديث تنبيه تجاوز الرصيد لحظيًا أثناء الكتابة (Card 59)
    _amount.addListener(() => setState(() {}));
  }

  // المحفظة المختارة حاليًا (رقمها واسم صاحبها للعرض)
  Map<String, dynamic>? get _selectedWallet {
    for (final w in widget.wallets) {
      if (w['category'] == _walletCategory) return Map<String, dynamic>.from(w as Map);
    }
    return null;
  }

  // الحدّ الأدنى للسحب (يطابق MIN_WITHDRAWAL في الخادم)
  static const num _minWithdrawal = 10;

  // هل المبلغ المُدخَل يتجاوز الرصيد المتاح؟ (Card 59)
  bool get _exceedsBalance {
    final amount = num.tryParse(_amount.text.trim());
    return amount != null && amount > widget.available;
  }

  // Card 3: هل المبلغ المُدخَل أقلّ من الحدّ الأدنى للسحب؟
  bool get _belowMinimum {
    final amount = num.tryParse(_amount.text.trim());
    return amount != null && amount > 0 && amount < _minWithdrawal;
  }

  Future<void> _submit() async {
    final amount = num.tryParse(_amount.text.trim());
    if (amount == null || amount <= 0) {
      _snack('أدخل مبلغًا صحيحًا');
      return;
    }
    // Card 3: تنبيه بارز (نافذة) عند طلب سحب أقلّ من الحدّ الأدنى — بنفس أسلوب
    // تنبيه تجاوز الرصيد (Card 59).
    if (amount < _minWithdrawal) {
      await _showBelowMinAlert(amount);
      return;
    }
    // Card 59: تنبيه واضح بأنّ المبلغ المطلوب أكبر من الرصيد الفعلي في المحفظة
    if (amount > widget.available) {
      await _showExceedsAlert(amount);
      return;
    }
    if (_walletCategory == null) {
      _snack('اختر طريقة السحب');
      return;
    }
    setState(() => _submitting = true);
    try {
      await widget.api.post('/captains/me/withdrawals', {
        'amount': amount,
        'walletCategory': _walletCategory,
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

  // Card 3: نافذة تنبيه بارزة عند طلب سحب أقلّ من الحدّ الأدنى المسموح
  Future<void> _showBelowMinAlert(num amount) async {
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.warning_amber_rounded, color: YallaColors.error, size: 36),
        title: const Text('المبلغ أقلّ من الحدّ الأدنى'),
        content: Text(
          'المبلغ المطلوب ($amount ₪) أقلّ من الحدّ الأدنى للسحب '
          '($_minWithdrawal ₪).\n\nيرجى إدخال مبلغ لا يقلّ عن $_minWithdrawal ₪.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('حسنًا')),
        ],
      ),
    );
  }

  // Card 59: نافذة تنبيه بارزة عند طلب سحب أكبر من الرصيد الموجود في المحفظة
  Future<void> _showExceedsAlert(num amount) async {
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.warning_amber_rounded, color: YallaColors.error, size: 36),
        title: const Text('رصيدك غير كافٍ'),
        content: Text(
          'المبلغ المطلوب ($amount ₪) أكبر من رصيدك المتاح للسحب '
          '(${widget.available} ₪).\n\nلا يمكنك سحب أكثر مما تملك في محفظتك.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('حسنًا')),
        ],
      ),
    );
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
            decoration: InputDecoration(
              labelText: 'المبلغ (₪)',
              prefixIcon: const Icon(Icons.payments),
              border: const OutlineInputBorder(),
              // تنبيه لحظي أسفل الحقل: أقلّ من الحدّ الأدنى (Card 3) أو تجاوز الرصيد (Card 59)
              errorText: _belowMinimum
                  ? 'الحدّ الأدنى للسحب $_minWithdrawal ₪'
                  : _exceedsBalance
                      ? 'المبلغ أكبر من رصيدك المتاح (${widget.available} ₪)'
                      : null,
            ),
          ),
          const SizedBox(height: 12),
          // Card 71: طريقة السحب تعرض المحافظ الإلكترونية التي أضافها الكابتن فقط
          DropdownButtonFormField<String>(
            value: _walletCategory,
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: 'طريقة السحب',
              prefixIcon: Icon(Icons.account_balance_wallet),
              border: OutlineInputBorder(),
            ),
            items: widget.wallets.map((w) {
              final cat = w['category'] as String? ?? '';
              final number = '${w['number'] ?? ''}';
              return DropdownMenuItem(
                value: cat,
                child: Text('${_walletCategories[cat] ?? cat} · $number',
                    overflow: TextOverflow.ellipsis),
              );
            }).toList(),
            onChanged: (v) => setState(() => _walletCategory = v),
          ),
          // عرض تفاصيل المحفظة المختارة (رقمها واسم صاحبها) للتأكيد
          if (_selectedWallet != null) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.info_outline, size: 16, color: YallaColors.muted),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    'سيُحوَّل إلى: ${_selectedWallet!['number'] ?? ''}'
                    '${(_selectedWallet!['ownerName'] as String?)?.isNotEmpty ?? false ? ' — ${_selectedWallet!['ownerName']}' : ''}',
                    style: const TextStyle(color: YallaColors.muted, fontSize: 12),
                  ),
                ),
              ],
            ),
          ],
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
    super.dispose();
  }
}

// Card 67: نموذج إدارة المحافظ الإلكترونية المحفوظة — لكل تصنيف رقم المحفظة
// واسم صاحبها. تُحفَظ الإدخالات ذات الرقم فقط (يتجاهل الخادم الفارغ).
class _PayoutWalletsForm extends StatefulWidget {
  final ApiClient api;
  final List<dynamic> initial;
  const _PayoutWalletsForm({required this.api, required this.initial});

  @override
  State<_PayoutWalletsForm> createState() => _PayoutWalletsFormState();
}

class _PayoutWalletsFormState extends State<_PayoutWalletsForm> {
  // متحكّمات الرقم واسم صاحبه لكل تصنيف
  final Map<String, TextEditingController> _number = {};
  final Map<String, TextEditingController> _owner = {};
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    for (final cat in _walletCategories.keys) {
      final existing = widget.initial.firstWhere(
        (w) => w['category'] == cat,
        orElse: () => null,
      );
      _number[cat] = TextEditingController(text: existing?['number']?.toString() ?? '');
      _owner[cat] = TextEditingController(text: existing?['ownerName']?.toString() ?? '');
    }
  }

  Future<void> _submit() async {
    final wallets = <Map<String, String>>[];
    for (final cat in _walletCategories.keys) {
      final number = _number[cat]!.text.trim();
      if (number.isEmpty) continue; // نتجاهل التصنيفات بلا رقم
      wallets.add({
        'category': cat,
        'number': number,
        'ownerName': _owner[cat]!.text.trim(),
      });
    }
    setState(() => _submitting = true);
    try {
      await widget.api.put('/captains/me/payout-wallets', {'wallets': wallets});
      if (!mounted) return;
      Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
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
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('محافظي الإلكترونية', style: Theme.of(context).textTheme.titleLarge),
            const Text('أدخل رقم المحفظة واسم صاحبها لكل تصنيف تستخدمه.',
                style: TextStyle(color: YallaColors.muted, fontSize: 13)),
            const SizedBox(height: 16),
            for (final entry in _walletCategories.entries) ...[
              Text(entry.value, style: const TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 6),
              TextField(
                controller: _number[entry.key],
                keyboardType: TextInputType.text,
                decoration: const InputDecoration(
                  labelText: 'رقم المحفظة',
                  prefixIcon: Icon(Icons.tag),
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _owner[entry.key],
                decoration: const InputDecoration(
                  labelText: 'اسم صاحب المحفظة',
                  prefixIcon: Icon(Icons.person),
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
              ),
              const SizedBox(height: 16),
            ],
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _submitting ? null : _submit,
                icon: _submitting
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.save),
                label: const Text('حفظ'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    for (final c in _number.values) {
      c.dispose();
    }
    for (final c in _owner.values) {
      c.dispose();
    }
    super.dispose();
  }
}
