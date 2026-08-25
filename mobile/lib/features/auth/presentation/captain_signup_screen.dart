// Card 79: شاشة تسجيل حساب كابتن من التطبيق.
// تجمع الاسم الرباعي والهاتف وكلمة السر ورقم الهوية وتاريخ الميلاد ونوع المركبة
// وصورة الهوية الرسمية والسيلفي مع الهوية، ثم ترسلها كطلب توثيق (قيد المراجعة).
// لا يُنشأ حساب مباشرة — الأدمن يقبل الطلب فيُنشأ الحساب، أو يرفضه فيُحذف.

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/network/api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/util/vehicles.dart';

class CaptainSignupScreen extends StatefulWidget {
  final ApiClient api;
  const CaptainSignupScreen({super.key, required this.api});

  @override
  State<CaptainSignupScreen> createState() => _CaptainSignupScreenState();
}

class _CaptainSignupScreenState extends State<CaptainSignupScreen> {
  final _formKey = GlobalKey<FormState>();
  final _fullName = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  final _nationalId = TextEditingController();
  final _picker = ImagePicker();

  String _vehicleType = 'motorcycle';
  DateTime? _birthDate;
  String? _idPhotoPath;
  String? _selfiePath;

  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _fullName.dispose();
    _phone.dispose();
    _password.dispose();
    _nationalId.dispose();
    super.dispose();
  }

  Future<void> _pick(bool isIdPhoto) async {
    final img = await _picker.pickImage(source: ImageSource.gallery, imageQuality: 70);
    if (img == null) return;
    setState(() {
      if (isIdPhoto) {
        _idPhotoPath = img.path;
      } else {
        _selfiePath = img.path;
      }
    });
  }

  Future<void> _pickBirthDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime(now.year - 20),
      firstDate: DateTime(now.year - 80),
      lastDate: DateTime(now.year - 16), // ١٦ عامًا حدّ أدنى
    );
    if (picked != null) setState(() => _birthDate = picked);
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_birthDate == null) {
      setState(() => _error = 'أدخل تاريخ الميلاد');
      return;
    }
    if (_idPhotoPath == null || _selfiePath == null) {
      setState(() => _error = 'أرفق صورة الهوية والسيلفي مع الهوية');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await widget.api.postMultipartFiles(
        '/auth/captain/apply',
        fields: {
          'fullName': _fullName.text.trim(),
          'phone': _phone.text.trim(),
          'password': _password.text,
          'nationalId': _nationalId.text.trim(),
          'birthDate': _birthDate!.toIso8601String(),
          'vehicleType': _vehicleType,
        },
        files: {
          'idPhoto': _idPhotoPath!,
          'selfie': _selfiePath!,
        },
      );
      if (!mounted) return;
      // إشعار قيد التوثيق ثم العودة لصفحة الدخول
      await showDialog<void>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('قيد التوثيق'),
          content: const Text(
            'تم استلام طلبك وهو قيد التوثيق. سنُعلمك عند اعتماد حسابك لتتمكّن من الدخول.',
          ),
          actions: [
            FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('حسنًا')),
          ],
        ),
      );
      if (mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'تعذّر الاتصال بالخادم — تحقّق من الشبكة');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('تسجيل ككابتن')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'سجّل بياناتك ومستنداتك ليتمّ توثيق حسابك من الإدارة.',
                style: TextStyle(color: YallaColors.muted),
              ),
              const SizedBox(height: 20),

              TextFormField(
                controller: _fullName,
                decoration: const InputDecoration(
                  labelText: 'الاسم الرباعي',
                  prefixIcon: Icon(Icons.person_outline),
                ),
                validator: (v) => (v == null || v.trim().split(' ').length < 2) ? 'أدخل الاسم الرباعي' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(
                  labelText: 'رقم الجوال',
                  prefixIcon: Icon(Icons.phone_outlined),
                ),
                validator: (v) => (v == null || v.length < 6) ? 'أدخل رقم جوال صحيح' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _password,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'كلمة المرور',
                  prefixIcon: Icon(Icons.lock_outline),
                ),
                validator: (v) => (v == null || v.length < 6) ? '6 أحرف على الأقل' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _nationalId,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'رقم الهوية',
                  prefixIcon: Icon(Icons.badge_outlined),
                ),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'أدخل رقم الهوية' : null,
              ),
              const SizedBox(height: 16),

              // تاريخ الميلاد
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.cake_outlined),
                title: Text(_birthDate == null
                    ? 'تاريخ الميلاد'
                    : 'تاريخ الميلاد: ${_birthDate!.year}/${_birthDate!.month}/${_birthDate!.day}'),
                trailing: TextButton(onPressed: _pickBirthDate, child: const Text('اختيار')),
              ),
              const Divider(),

              // نوع المركبة (Card 92): هوائية/كهربائية/نارية
              DropdownButtonFormField<String>(
                value: _vehicleType,
                decoration: const InputDecoration(
                  labelText: 'نوع المركبة',
                  prefixIcon: Icon(Icons.two_wheeler_outlined),
                ),
                items: kVehicleTypes
                    .map((v) => DropdownMenuItem(value: v.value, child: Text(v.label)))
                    .toList(),
                onChanged: (v) => setState(() => _vehicleType = v ?? 'motorcycle'),
              ),
              const SizedBox(height: 16),

              // المستندات
              _docPicker('صورة الهوية الرسمية', _idPhotoPath, () => _pick(true)),
              const SizedBox(height: 12),
              _docPicker('سيلفي مع الهوية', _selfiePath, () => _pick(false)),

              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!, style: const TextStyle(color: YallaColors.error), textAlign: TextAlign.center),
              ],

              const SizedBox(height: 24),
              FilledButton(
                onPressed: _loading ? null : _submit,
                child: _loading
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('إرسال طلب التوثيق'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _docPicker(String label, String? path, VoidCallback onPick) {
    final picked = path != null;
    return Card(
      child: ListTile(
        leading: Icon(picked ? Icons.check_circle : Icons.image_outlined,
            color: picked ? Colors.green : YallaColors.muted),
        title: Text(label),
        subtitle: Text(picked ? 'تم اختيار الصورة' : 'لم تُرفق بعد'),
        trailing: TextButton(onPressed: onPick, child: Text(picked ? 'تغيير' : 'اختيار')),
      ),
    );
  }
}
