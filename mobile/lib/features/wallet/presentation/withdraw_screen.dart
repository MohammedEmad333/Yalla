// شاشة سحب الرصيد — طريقة استلام منظّمة، مبالغ سريعة وملخص قبل الإرسال.

import 'package:flutter/material.dart';

import '../../../core/network/api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../data/wallet_repository.dart';

enum _WithdrawDestination { bank, jawwalPay, palPay, other }

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
  final _customDestination = TextEditingController();
  final _accountNumber = TextEditingController();
  final _accountOwner = TextEditingController();
  final _note = TextEditingController();

  bool _loading = true;
  bool _submitting = false;
  num _available = 0;
  bool _hasActiveOrder = false;
  String? _error;
  _WithdrawDestination _destination = _WithdrawDestination.jawwalPay;

  int get _amountValue => int.tryParse(_amount.text.trim()) ?? 0;
  num get _fee => 0;
  num get _netAmount => (_amountValue - _fee).clamp(0, double.infinity);

  @override
  void initState() {
    super.initState();
    _amount.addListener(_refresh);
    _load();
  }

  void _refresh() {
    if (mounted) setState(() {});
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

  String get _destinationLabel => switch (_destination) {
        _WithdrawDestination.bank => 'بنك فلسطين',
        _WithdrawDestination.jawwalPay => 'جوال باي',
        _WithdrawDestination.palPay => 'بال باي',
        _WithdrawDestination.other => _customDestination.text.trim(),
      };

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await _repo.requestWithdrawal(
        amount: _amountValue,
        destination: _destinationLabel,
        accountNumber: _accountNumber.text.trim(),
        accountOwner: _accountOwner.text.trim(),
        note: _note.text.trim(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('تم إرسال طلب السحب — بانتظار مراجعة الإدارة'),
        ),
      );
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'تعذّر الاتصال بالخادم — تحقّق من الشبكة');
      }
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
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
              child: _hasActiveOrder ? _activeOrderWarning() : _form(),
            ),
    );
  }

  Widget _activeOrderWarning() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: YallaColors.error.withValues(alpha: .08),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: YallaColors.error.withValues(alpha: .35)),
      ),
      child: Column(
        children: [
          Icon(Icons.warning_amber_rounded, color: YallaColors.error, size: 48),
          const SizedBox(height: 12),
          const Text(
            'لا يمكنك سحب رصيدك أثناء وجود طلب جارٍ',
            style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            'بإمكانك طلب السحب بعد اكتمال توصيل الطلب وخصم قيمته من رصيدك.',
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
          _availableCard(),
          const SizedBox(height: 18),
          Text(
            'المبلغ',
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 10),
          _quickAmounts(),
          const SizedBox(height: 10),
          TextFormField(
            controller: _amount,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'المبلغ المطلوب سحبه',
              prefixIcon: Icon(Icons.payments_outlined),
              suffixText: '₪',
            ),
            validator: (v) {
              final n = int.tryParse((v ?? '').trim());
              if (n == null || n <= 0) return 'أدخل مبلغًا صحيحًا';
              if (n > _available) {
                return 'المبلغ يتجاوز رصيدك المتاح ($_available ₪)';
              }
              return null;
            },
          ),
          const SizedBox(height: 20),
          Text(
            'طريقة الاستلام',
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 10),
          _destinationSelector(),
          if (_destination == _WithdrawDestination.other) ...[
            const SizedBox(height: 12),
            TextFormField(
              controller: _customDestination,
              decoration: const InputDecoration(
                labelText: 'اسم البنك أو المحفظة',
                prefixIcon: Icon(Icons.account_balance_outlined),
              ),
              validator: (v) {
                if (_destination != _WithdrawDestination.other) return null;
                return (v == null || v.trim().length < 2)
                    ? 'اذكر اسم البنك أو المحفظة'
                    : null;
              },
            ),
          ],
          const SizedBox(height: 12),
          TextFormField(
            controller: _accountNumber,
            keyboardType: TextInputType.text,
            decoration: InputDecoration(
              labelText: _destination == _WithdrawDestination.bank
                  ? 'رقم الحساب / IBAN'
                  : 'رقم المحفظة / الحساب',
              prefixIcon: const Icon(Icons.numbers_outlined),
            ),
            validator: (v) => (v == null || v.trim().length < 4)
                ? 'أدخل رقم الحساب أو المحفظة'
                : null,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _accountOwner,
            decoration: const InputDecoration(
              labelText: 'اسم صاحب الحساب',
              prefixIcon: Icon(Icons.person_outline),
            ),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _note,
            minLines: 1,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'ملاحظة (اختياري)',
              prefixIcon: Icon(Icons.notes_outlined),
            ),
          ),
          const SizedBox(height: 18),
          _summaryCard(),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(
              _error!,
              style: TextStyle(color: YallaColors.error),
              textAlign: TextAlign.center,
            ),
          ],
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: _submitting ? null : _submit,
            icon: _submitting
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.send_rounded),
            label: const Text('تأكيد طلب السحب'),
          ),
        ],
      ),
    );
  }

  Widget _availableCard() => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: YallaColors.primary.withValues(alpha: .08),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          children: [
            Icon(Icons.account_balance_wallet_outlined,
                color: YallaColors.primaryDeep),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'الرصيد المتاح للسحب',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    '$_available ₪',
                    textDirection: TextDirection.ltr,
                    style: TextStyle(
                      color: YallaColors.primary,
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );

  Widget _quickAmounts() {
    final values = <int>[10, 20];
    if (_available >= 50) values.add(50);
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        ...values.where((v) => v <= _available).map((value) {
          return ChoiceChip(
            selected: _amountValue == value,
            label: Text('$value ₪'),
            onSelected: (_) => _amount.text = value.toString(),
          );
        }),
        if (_available > 0)
          ChoiceChip(
            selected: _amountValue == _available.toInt(),
            label: const Text('الكل'),
            onSelected: (_) => _amount.text = _available.toInt().toString(),
          ),
      ],
    );
  }

  Widget _destinationSelector() {
    const entries = [
      (_WithdrawDestination.bank, 'بنك', Icons.account_balance_rounded),
      (_WithdrawDestination.jawwalPay, 'جوال باي', Icons.account_balance_wallet_rounded),
      (_WithdrawDestination.palPay, 'بال باي', Icons.account_balance_wallet_rounded),
      (_WithdrawDestination.other, 'أخرى', Icons.more_horiz_rounded),
    ];
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: entries.map((entry) {
        return ChoiceChip(
          selected: _destination == entry.$1,
          avatar: Icon(entry.$3, size: 18),
          label: Text(entry.$2),
          onSelected: (_) => setState(() => _destination = entry.$1),
        );
      }).toList(),
    );
  }

  Widget _summaryCard() {
    final amount = _amountValue;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context)
            .colorScheme
            .surfaceContainerHighest
            .withValues(alpha: .35),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: YallaColors.outline),
      ),
      child: Column(
        children: [
          _summaryRow('المبلغ المطلوب', '$amount ₪'),
          const SizedBox(height: 8),
          _summaryRow('رسوم السحب', '${_fee.toStringAsFixed(0)} ₪'),
          const Divider(height: 18),
          _summaryRow(
            'سيصل إليك',
            '${_netAmount.toStringAsFixed(0)} ₪',
            bold: true,
          ),
          const SizedBox(height: 8),
          _summaryRow(
            'الطريقة',
            _destination == _WithdrawDestination.other && _destinationLabel.isEmpty
                ? 'لم تحدد بعد'
                : _destinationLabel,
          ),
        ],
      ),
    );
  }

  Widget _summaryRow(String label, String value, {bool bold = false}) => Row(
        children: [
          Text(
            label,
            style: TextStyle(
              color: bold ? null : YallaColors.muted,
              fontWeight: bold ? FontWeight.w900 : FontWeight.w500,
            ),
          ),
          const Spacer(),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: TextStyle(
                fontWeight: bold ? FontWeight.w900 : FontWeight.w700,
              ),
            ),
          ),
        ],
      );

  @override
  void dispose() {
    _amount.removeListener(_refresh);
    _amount.dispose();
    _customDestination.dispose();
    _accountNumber.dispose();
    _accountOwner.dispose();
    _note.dispose();
    super.dispose();
  }
}
