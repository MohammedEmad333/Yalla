// Card 98: شاشة سحب رصيد الزبون إلى محفظة إلكترونية أو بنك يذكره في الطلب.
// Card 99: إن كان للزبون طلب جارٍ، يُمنع السحب ويظهر تحذير يوضّح السبب.

import 'package:flutter/material.dart';

import '../../../core/network/api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../data/wallet_repository.dart';

class WithdrawScreen extends StatefulWidget {
  final ApiClient api;
  const WithdrawScreen({super.key, required this.api});

  @override
  State<WithdrawScreen> createState() => _WithdrawScreenState();
}

class _WithdrawScreenState extends State<WithdrawScreen> {
  late final WalletRepository _repo = WalletRepository(widget.api);
  final _formKey = GlobalKey<FormState>();
  final _amount = TextEditingController();
  final _destination = TextEditingController();
  final _accountNumber = TextEditingController();
  final _accountOwner = TextEditingController();
  final _note = TextEditingController();

  bool _loading = true;
  bool _submitting = false;
  num _available = 0;
  bool _hasActiveOrder = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await _repo.getWithdrawAvailability();
      if (!mounted) return;
      setState(() {
        _available = data['available'] as num? ?? 0;
        _hasActiveOrder = data['hasActiveOrder'] as bool? ?? false;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.message;
      });
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await _repo.requestWithdrawal(
        amount: int.parse(_amount.text.trim()),
        destination: _destination.text.trim(),
        accountNumber: _accountNumber.text.trim(),
        accountOwner: _accountOwner.text.trim(),
        note: _note.text.trim(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم إرسال طلب السحب — بانتظار مراجعة الإدارة')),
      );
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'تعذّر الاتصال بالخادم — تحقّق من الشبكة');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('سحب الرصيد')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: _hasActiveOrder ? _activeOrderWarning() : _form(),
            ),
    );
  }

  // Card 99: تحذير يمنع السحب أثناء وجود طلب جارٍ
  Widget _activeOrderWarning() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: YallaColors.error.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: YallaColors.error.withValues(alpha: 0.4)),
      ),
      child: const Column(
        children: [
          Icon(Icons.warning_amber_rounded, color: YallaColors.error, size: 48),
          SizedBox(height: 12),
          Text(
            'لا يمكنك سحب رصيدك أثناء وجود طلب جارٍ',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
            textAlign: TextAlign.center,
          ),
          SizedBox(height: 8),
          Text(
            'بإمكانك طلب سحب الرصيد بعد اكتمال توصيل طلبك وخصم قيمته من رصيدك.',
            style: TextStyle(color: YallaColors.muted),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _form() {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: YallaColors.primary.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(
              children: [
                const Icon(Icons.account_balance_wallet_outlined, color: YallaColors.primaryDeep),
                const SizedBox(width: 10),
                Text('الرصيد المتاح للسحب: $_available ₪',
                    style: const TextStyle(fontWeight: FontWeight.w700)),
              ],
            ),
          ),
          const SizedBox(height: 20),
          TextFormField(
            controller: _amount,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'المبلغ المطلوب سحبه (₪)',
              prefixIcon: Icon(Icons.payments_outlined),
            ),
            validator: (v) {
              final n = int.tryParse((v ?? '').trim());
              if (n == null || n <= 0) return 'أدخل مبلغًا صحيحًا';
              if (n > _available) return 'المبلغ يتجاوز رصيدك المتاح ($_available ₪)';
              return null;
            },
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _destination,
            decoration: const InputDecoration(
              labelText: 'المحفظة الإلكترونية أو البنك',
              hintText: 'مثال: جوال باي، بال باي، بنك فلسطين',
              prefixIcon: Icon(Icons.account_balance_outlined),
            ),
            validator: (v) => (v == null || v.trim().length < 2) ? 'اذكر المحفظة أو البنك' : null,
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _accountNumber,
            keyboardType: TextInputType.text,
            decoration: const InputDecoration(
              labelText: 'رقم الحساب / المحفظة',
              prefixIcon: Icon(Icons.numbers_outlined),
            ),
            validator: (v) => (v == null || v.trim().length < 4) ? 'أدخل رقم الحساب/المحفظة' : null,
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _accountOwner,
            decoration: const InputDecoration(
              labelText: 'اسم صاحب الحساب (اختياري)',
              prefixIcon: Icon(Icons.person_outline),
            ),
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _note,
            decoration: const InputDecoration(
              labelText: 'ملاحظة (اختياري)',
              prefixIcon: Icon(Icons.notes_outlined),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 14),
            Text(_error!, style: const TextStyle(color: YallaColors.error), textAlign: TextAlign.center),
          ],
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: _submitting ? null : _submit,
            icon: _submitting
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.send),
            label: const Text('إرسال طلب السحب'),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _amount.dispose();
    _destination.dispose();
    _accountNumber.dispose();
    _accountOwner.dispose();
    _note.dispose();
    super.dispose();
  }
}
