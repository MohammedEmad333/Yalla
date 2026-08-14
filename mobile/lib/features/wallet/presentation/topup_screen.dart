// شاشة شحن الرصيد (المرحلة 1) — التدفّق:
//   1) يختار المستخدم طريقة التحويل (بنك فلسطين/جوال باي/بال باي)
//   2) تظهر بيانات الحساب وتعليمات التحويل
//   3) يُدخل المبلغ ورقم العملية ويرفع صورة الإيصال
//   4) يُرسل الطلب → يُنشأ "قيد المراجعة" حتى يوافق الأدمن فيُضاف الرصيد
//
// ملاحظة: السعر النهائي والموافقة يتمّان في الخادم (مصدر الحقيقة).

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/network/api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../data/wallet_repository.dart';

class TopupScreen extends StatefulWidget {
  final ApiClient api;
  const TopupScreen({super.key, required this.api});

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
  Map<String, dynamic>? _selected; // الطريقة المختارة
  XFile? _receipt; // صورة الإيصال
  bool _loading = true;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _loadMethods();
  }

  Future<void> _loadMethods() async {
    try {
      final methods = await _repo.getMethods();
      setState(() {
        _methods = methods;
        _selected = methods.isNotEmpty ? Map<String, dynamic>.from(methods.first) : null;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  // اختيار صورة الإيصال من المعرض
  Future<void> _pickReceipt() async {
    final img = await _picker.pickImage(source: ImageSource.gallery, imageQuality: 70);
    if (img != null) setState(() => _receipt = img);
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selected == null) return;
    // يجب توفّر صورة الإيصال أو رقم العملية على الأقلّ
    if (_receipt == null && _reference.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('أرفق صورة الإيصال أو أدخل رقم العملية')),
      );
      return;
    }

    setState(() => _submitting = true);
    try {
      await _repo.submitTopup(
        method: _selected!['key'] as String,
        amount: int.parse(_amount.text.trim()),
        referenceNumber: _reference.text.trim(),
        receiptPath: _receipt?.path,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تمّ إرسال طلب الشحن — بانتظار مراجعة الإدارة')),
      );
      Navigator.of(context).pop(true); // نُعيد true ليُعاد تحميل المحفظة
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  void dispose() {
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
                padding: const EdgeInsets.all(16),
                children: [
                  Text('اختر طريقة التحويل',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 10),
                  _methodSelector(),
                  const SizedBox(height: 16),
                  if (_selected != null) _instructionsCard(),
                  const SizedBox(height: 20),
                  TextFormField(
                    controller: _amount,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'المبلغ (₪)',
                      prefixIcon: Icon(Icons.payments_outlined),
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
                    decoration: const InputDecoration(
                      labelText: 'رقم العملية (من إشعار التحويل)',
                      prefixIcon: Icon(Icons.confirmation_number_outlined),
                    ),
                  ),
                  const SizedBox(height: 16),
                  _receiptPicker(),
                  const SizedBox(height: 24),
                  ElevatedButton(
                    onPressed: _submitting ? null : _submit,
                    child: _submitting
                        ? const SizedBox(
                            width: 22, height: 22,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('إرسال طلب الشحن'),
                  ),
                ],
              ),
            ),
    );
  }

  // اختيار الطريقة عبر رقائق قابلة للتحديد
  Widget _methodSelector() {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: _methods.map((m) {
        final method = Map<String, dynamic>.from(m as Map);
        final selected = _selected?['key'] == method['key'];
        return ChoiceChip(
          label: Text(method['label'] as String? ?? ''),
          selected: selected,
          onSelected: (_) => setState(() => _selected = method),
        );
      }).toList(),
    );
  }

  // بطاقة تعليمات التحويل + بيانات الحساب للطريقة المختارة
  Widget _instructionsCard() {
    final account = _selected!['account'] as Map? ?? {};
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: YallaColors.secondaryContainer,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(_selected!['instructions'] as String? ?? '',
              style: const TextStyle(color: YallaColors.onSecondaryContainer, height: 1.5)),
          const Divider(height: 20),
          if (account['name'] != null) _accountRow('الاسم', account['name'].toString()),
          if (account['number'] != null) _accountRow('الحساب/الرقم', account['number'].toString()),
          if (account['iban'] != null) _accountRow('IBAN', account['iban'].toString()),
        ],
      ),
    );
  }

  Widget _accountRow(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(
          children: [
            Text('$label: ', style: const TextStyle(fontWeight: FontWeight.w700, color: YallaColors.secondaryDeep)),
            Expanded(child: Text(value, style: const TextStyle(color: YallaColors.onSecondaryContainer))),
          ],
        ),
      );

  // منطقة رفع صورة الإيصال
  Widget _receiptPicker() {
    return InkWell(
      onTap: _pickReceipt,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        height: _receipt == null ? 120 : 200,
        width: double.infinity,
        decoration: BoxDecoration(
          color: YallaColors.card,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: YallaColors.outline),
        ),
        child: _receipt == null
            ? const Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.upload_file, size: 36, color: YallaColors.muted),
                  SizedBox(height: 8),
                  Text('ارفع صورة الإيصال', style: TextStyle(color: YallaColors.muted)),
                ],
              )
            : ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: Image.file(File(_receipt!.path), fit: BoxFit.cover),
              ),
      ),
    );
  }
}
