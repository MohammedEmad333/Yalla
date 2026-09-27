import 'package:flutter/material.dart';

import '../core/session.dart';

class RegisterScreen extends StatefulWidget {
  final PartnerSession session;
  const RegisterScreen({super.key, required this.session});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  final _storeName = TextEditingController();
  final _storePhone = TextEditingController();
  final _category = TextEditingController(text: 'مطاعم');
  final _city = TextEditingController();
  final _neighborhood = TextEditingController();
  final _street = TextEditingController();
  final _description = TextEditingController();

  bool _busy = false;
  bool _hidden = true;
  String _error = '';

  @override
  void dispose() {
    for (final c in [_name, _phone, _password, _confirm, _storeName, _storePhone, _category, _city, _neighborhood, _street, _description]) {
      c.dispose();
    }
    super.dispose();
  }

  String? _required(String? value) => (value ?? '').trim().isEmpty ? 'هذا الحقل مطلوب' : null;

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (!_formKey.currentState!.validate()) return;
    if (_password.text.length < 6) {
      setState(() => _error = 'كلمة السر يجب أن تكون ٦ أحرف على الأقل');
      return;
    }
    if (_password.text != _confirm.text) {
      setState(() => _error = 'كلمتا السر غير متطابقتين');
      return;
    }
    setState(() { _busy = true; _error = ''; });
    try {
      await widget.session.register({
        'name': _name.text.trim(),
        'phone': _phone.text.trim(),
        'password': _password.text,
        'storeName': _storeName.text.trim(),
        'storePhone': _storePhone.text.trim(),
        'category': _category.text.trim(),
        'city': _city.text.trim(),
        'neighborhood': _neighborhood.text.trim(),
        'street': _street.text.trim(),
        'description': _description.text.trim(),
      });
      if (mounted) Navigator.of(context).popUntil((route) => route.isFirst);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('إنشاء حساب تاجر')),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
            children: [
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF3E8),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.storefront_rounded, color: Color(0xFFFF7A00)),
                    SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'أنشئ حسابك وأرسل بيانات متجرك للمراجعة. لن يظهر المتجر للزبائن قبل اعتماد الإدارة.',
                        style: TextStyle(height: 1.55, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 22),
              const Text('بيانات صاحب المتجر', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
              const SizedBox(height: 12),
              TextFormField(controller: _name, validator: _required, textInputAction: TextInputAction.next, decoration: const InputDecoration(labelText: 'الاسم الكامل', prefixIcon: Icon(Icons.person_rounded))),
              const SizedBox(height: 12),
              TextFormField(controller: _phone, validator: _required, keyboardType: TextInputType.phone, textDirection: TextDirection.ltr, textInputAction: TextInputAction.next, decoration: const InputDecoration(labelText: 'رقم الجوال', prefixIcon: Icon(Icons.phone_rounded))),
              const SizedBox(height: 12),
              TextFormField(controller: _password, validator: _required, obscureText: _hidden, textInputAction: TextInputAction.next, decoration: InputDecoration(labelText: 'كلمة السر', prefixIcon: const Icon(Icons.lock_rounded), suffixIcon: IconButton(onPressed: () => setState(() => _hidden = !_hidden), icon: Icon(_hidden ? Icons.visibility_rounded : Icons.visibility_off_rounded)))),
              const SizedBox(height: 12),
              TextFormField(controller: _confirm, validator: _required, obscureText: _hidden, textInputAction: TextInputAction.next, decoration: const InputDecoration(labelText: 'تأكيد كلمة السر', prefixIcon: Icon(Icons.lock_outline_rounded))),
              const SizedBox(height: 24),
              const Text('بيانات المتجر', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
              const SizedBox(height: 12),
              TextFormField(controller: _storeName, validator: _required, textInputAction: TextInputAction.next, decoration: const InputDecoration(labelText: 'اسم المتجر', prefixIcon: Icon(Icons.store_rounded))),
              const SizedBox(height: 12),
              TextFormField(controller: _storePhone, keyboardType: TextInputType.phone, textDirection: TextDirection.ltr, textInputAction: TextInputAction.next, decoration: const InputDecoration(labelText: 'هاتف المتجر (اختياري)', prefixIcon: Icon(Icons.call_rounded))),
              const SizedBox(height: 12),
              TextFormField(controller: _category, validator: _required, textInputAction: TextInputAction.next, decoration: const InputDecoration(labelText: 'نوع المتجر', prefixIcon: Icon(Icons.category_rounded))),
              const SizedBox(height: 12),
              TextFormField(controller: _city, validator: _required, textInputAction: TextInputAction.next, decoration: const InputDecoration(labelText: 'المدينة', prefixIcon: Icon(Icons.location_city_rounded))),
              const SizedBox(height: 12),
              TextFormField(controller: _neighborhood, textInputAction: TextInputAction.next, decoration: const InputDecoration(labelText: 'المنطقة / الحي', prefixIcon: Icon(Icons.place_rounded))),
              const SizedBox(height: 12),
              TextFormField(controller: _street, textInputAction: TextInputAction.next, decoration: const InputDecoration(labelText: 'الشارع / تفاصيل العنوان', prefixIcon: Icon(Icons.signpost_rounded))),
              const SizedBox(height: 12),
              TextFormField(controller: _description, minLines: 3, maxLines: 5, decoration: const InputDecoration(labelText: 'وصف مختصر للمتجر', alignLabelWithHint: true, prefixIcon: Icon(Icons.description_rounded))),
              if (_error.isNotEmpty) ...[
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: const Color(0xFFFFEFEF), borderRadius: BorderRadius.circular(14)),
                  child: Text(_error, style: const TextStyle(color: Color(0xFFC23A3A), fontWeight: FontWeight.w700)),
                ),
              ],
              const SizedBox(height: 20),
              FilledButton.icon(
                onPressed: _busy ? null : _submit,
                icon: _busy
                    ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.send_rounded),
                label: Text(_busy ? 'جارٍ إرسال الطلب...' : 'إنشاء الحساب وإرسال المتجر للمراجعة'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
