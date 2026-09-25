// شاشة شحن الرصيد — تدفّق واضح مع مبالغ سريعة ونسخ بيانات التحويل ومعاينة الإيصال.

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/network/api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../data/wallet_repository.dart';

class TopupScreen extends StatefulWidget {
  final ApiClient api;
  final String? initialMethod;
  final int? initialAmount;

  const TopupScreen({
    super.key,
    required this.api,
    this.initialMethod,
    this.initialAmount,
  });

  @override
  State<TopupScreen> createState() => _TopupScreenState();
}

class _TopupScreenState extends State<TopupScreen> {
  late final WalletRepository _repo = WalletRepository(widget.api);
  final _formKey = GlobalKey<FormState>();
  final _amount = TextEditingController();
  final _reference = TextEditingController();
  final _picker = ImagePicker();

  List<dynamic> _methods = [];
  Map<String, dynamic>? _selected;
  XFile? _receipt;
  bool _loading = true;
  bool _submitting = false;

  int get _amountValue => int.tryParse(_amount.text.trim()) ?? 0;
  bool get _canSubmit =>
      !_submitting && _selected != null && _amountValue > 0 && _receipt != null;

  @override
  void initState() {
    super.initState();
    if (widget.initialAmount != null && widget.initialAmount! > 0) {
      _amount.text = widget.initialAmount.toString();
    }
    _amount.addListener(_refresh);
    _loadMethods();
  }

  void _refresh() {
    if (mounted) setState(() {});
  }

  Future<void> _loadMethods() async {
    try {
      final methods = await _repo.getMethods();
      if (!mounted) return;
      Map<String, dynamic>? selected;
      if (methods.isNotEmpty) {
        selected = Map<String, dynamic>.from(methods.first as Map);
        final initial = widget.initialMethod;
        if (initial != null) {
          for (final raw in methods) {
            final method = Map<String, dynamic>.from(raw as Map);
            if (method['key'] == initial) {
              selected = method;
              break;
            }
          }
        }
      }
      setState(() {
        _methods = methods;
        _selected = selected;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _pickReceipt() async {
    final img = await _picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 75,
    );
    if (img != null && mounted) setState(() => _receipt = img);
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selected == null || _receipt == null) return;

    setState(() => _submitting = true);
    try {
      await _repo.submitTopup(
        method: _selected!['key'] as String,
        amount: _amountValue,
        referenceNumber: _reference.text.trim(),
        receiptPath: _receipt!.path,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('تم إرسال طلب الشحن — بانتظار مراجعة الإدارة'),
        ),
      );
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  void dispose() {
    _amount.removeListener(_refresh);
    _amount.dispose();
    _reference.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('شحن الرصيد')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
                children: [
                  _steps(),
                  const SizedBox(height: 18),
                  Text(
                    'اختر طريقة التحويل',
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 10),
                  _methodSelector(),
                  const SizedBox(height: 16),
                  if (_selected != null) _instructionsCard(),
                  const SizedBox(height: 18),
                  _quickAmounts(),
                  const SizedBox(height: 10),
                  TextFormField(
                    controller: _amount,
                    keyboardType: TextInputType.number,
                    textDirection: TextDirection.ltr,
                    textAlign: TextAlign.right,
                    decoration: const InputDecoration(
                      labelText: 'المبلغ المطلوب شحنه',
                      prefixIcon: Icon(Icons.payments_outlined),
                      suffixText: '₪',
                    ),
                    validator: (v) {
                      final n = int.tryParse((v ?? '').trim());
                      if (n == null || n <= 0) return 'أدخل مبلغًا صحيحًا';
                      return null;
                    },
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _reference,
                    textDirection: TextDirection.ltr,
                    textAlign: TextAlign.right,
                    decoration: const InputDecoration(
                      labelText: 'رقم العملية / المرجع (اختياري)',
                      hintText: 'من إشعار التحويل',
                      prefixIcon: Icon(Icons.confirmation_number_outlined),
                    ),
                  ),
                  const SizedBox(height: 16),
                  _receiptPicker(),
                  const SizedBox(height: 22),
                  FilledButton.icon(
                    onPressed: _canSubmit ? _submit : null,
                    icon: _submitting
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.send_rounded),
                    label: const Text('إرسال طلب الشحن'),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _steps() {
    const steps = [
      ('1', 'اختر الطريقة'),
      ('2', 'حوّل المبلغ'),
      ('3', 'ارفع الإيصال'),
    ];
    return Row(
      children: [
        for (var i = 0; i < steps.length; i++) ...[
          Expanded(
            child: Column(
              children: [
                CircleAvatar(
                  radius: 14,
                  backgroundColor: YallaColors.primary.withValues(alpha: .12),
                  child: Text(
                    steps[i].$1,
                    style: TextStyle(
                      color: YallaColors.primary,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  steps[i].$2,
                  style: TextStyle(
                    color: YallaColors.onSurfaceVariant,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          if (i < steps.length - 1)
            Expanded(
              child: Container(
                height: 2,
                color: YallaColors.outline,
              ),
            ),
        ],
      ],
    );
  }

  Widget _quickAmounts() {
    const values = [20, 50, 100, 200];
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: values.map((value) {
        final selected = _amountValue == value;
        return ChoiceChip(
          selected: selected,
          label: Text('$value ₪'),
          onSelected: (_) => _amount.text = value.toString(),
        );
      }).toList(),
    );
  }

  Color _methodColor(Map method) {
    final hex = method['color'];
    if (hex is String && hex.startsWith('#') && hex.length == 7) {
      return Color(int.parse('FF${hex.substring(1)}', radix: 16));
    }
    return YallaColors.primary;
  }

  IconData _methodIcon(String? key) => switch (key) {
        'bank_of_palestine' => Icons.account_balance_rounded,
        'jawwal_pay' => Icons.account_balance_wallet_rounded,
        'palpay' => Icons.account_balance_wallet_rounded,
        _ => Icons.payments_outlined,
      };

  Widget _methodSelector() {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: _methods.map((m) {
        final method = Map<String, dynamic>.from(m as Map);
        final selected = _selected?['key'] == method['key'];
        final color = _methodColor(method);
        return ChoiceChip(
          showCheckmark: false,
          avatar: Icon(
            _methodIcon(method['key'] as String?),
            size: 18,
            color: selected ? Colors.white : color,
          ),
          label: Text(method['label'] as String? ?? ''),
          selected: selected,
          selectedColor: color,
          backgroundColor: color.withValues(alpha: .10),
          side: BorderSide(color: color.withValues(alpha: selected ? 1 : .35)),
          labelStyle: TextStyle(
            color: selected ? Colors.white : color,
            fontWeight: FontWeight.w800,
          ),
          onSelected: (_) => setState(() => _selected = method),
        );
      }).toList(),
    );
  }

  Widget _instructionsCard() {
    final account = _selected!['account'] as Map? ?? {};
    final color = _methodColor(_selected!);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .09),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: .28)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(_methodIcon(_selected!['key'] as String?),
                  size: 20, color: color),
              const SizedBox(width: 8),
              Text(
                _selected!['label'] as String? ?? '',
                style: TextStyle(
                  fontWeight: FontWeight.w900,
                  color: color,
                  fontSize: 16,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            _selected!['instructions'] as String? ?? '',
            style: TextStyle(color: YallaColors.onSurface, height: 1.5),
          ),
          Divider(height: 20, color: color.withValues(alpha: .25)),
          if (account['name'] != null)
            _accountRow('الاسم', account['name'].toString(), color),
          if (account['number'] != null)
            _accountRow('الحساب/الرقم', account['number'].toString(), color),
          if (account['iban'] != null)
            _accountRow('IBAN', account['iban'].toString(), color),
        ],
      ),
    );
  }

  Widget _accountRow(String label, String value, Color color) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Text(
              '$label: ',
              style: TextStyle(fontWeight: FontWeight.w800, color: color),
            ),
            Expanded(
              child: SelectableText(
                value,
                style: TextStyle(color: YallaColors.onSurface),
              ),
            ),
            IconButton(
              tooltip: 'نسخ $label',
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: value));
                if (!mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('تم نسخ $label')),
                );
              },
              icon: const Icon(Icons.copy_rounded, size: 19),
            ),
          ],
        ),
      );

  Widget _receiptPicker() {
    if (_receipt == null) {
      return InkWell(
        onTap: _pickReceipt,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          height: 128,
          width: double.infinity,
          decoration: BoxDecoration(
            color: YallaColors.card,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: YallaColors.outline),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.upload_file_rounded, size: 38, color: YallaColors.muted),
              const SizedBox(height: 8),
              const Text(
                'ارفع صورة الإيصال',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 3),
              Text(
                'صورة واضحة مطلوبة لإرسال الطلب',
                style: TextStyle(color: YallaColors.muted, fontSize: 12),
              ),
            ],
          ),
        ),
      );
    }

    final name = _receipt!.name.isNotEmpty
        ? _receipt!.name
        : _receipt!.path.split(Platform.pathSeparator).last;

    return Container(
      decoration: BoxDecoration(
        color: YallaColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: YallaColors.outline),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          AspectRatio(
            aspectRatio: 16 / 9,
            child: Image.file(
              File(_receipt!.path),
              width: double.infinity,
              fit: BoxFit.cover,
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
            child: Row(
              children: [
                const Icon(Icons.check_circle_rounded, color: Colors.green),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                TextButton.icon(
                  onPressed: _pickReceipt,
                  icon: const Icon(Icons.swap_horiz_rounded, size: 18),
                  label: const Text('تغيير'),
                ),
                IconButton(
                  tooltip: 'حذف الصورة',
                  onPressed: () => setState(() => _receipt = null),
                  icon: const Icon(Icons.delete_outline_rounded),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
