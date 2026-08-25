// شاشة مصادقة موحّدة للجميع (مستخدم/كابتن/أدمن): دخول برقم الهاتف وكلمة المرور،
// مع إمكانية إنشاء حساب مستخدم. النجاح يحدّث حالة الجلسة فتنتقل الواجهة تلقائيًا.

import 'package:flutter/material.dart';

import '../../../core/network/api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../data/auth_repository.dart';
import 'captain_signup_screen.dart';

class LoginScreen extends StatefulWidget {
  final AuthRepository authRepository;
  const LoginScreen({super.key, required this.authRepository});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _lastName = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  final _address = TextEditingController(); // Card 96: تفاصيل العنوان

  // Card 96: محافظات قطاع غزة لمنتقي "مكان السكن" (مطابقة لقائمة الخادم)
  static const _governorates = <String>[
    'غزة',
    'بيت حانون',
    'بيت لاهيا',
    'خانيونس',
    'رفح',
    'النصيرات',
    'المغازي',
    'البريج',
    'دير البلح',
    'الزوايدة',
  ];
  String? _governorate; // المحافظة المختارة

  bool _isRegister = false; // false = دخول، true = إنشاء حساب
  bool _loading = false;
  String? _error;

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      if (_isRegister) {
        await widget.authRepository.register(
          name: _name.text,
          lastName: _lastName.text,
          phone: _phone.text,
          password: _password.text,
          governorate: _governorate,
          address: _address.text,
        );
      } else {
        await widget.authRepository.login(
          phone: _phone.text,
          password: _password.text,
        );
      }
      // لا حاجة للتنقّل يدويًا — تغيّر الجلسة يقود الواجهة (انظر AuthGate)
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
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Text('🛵', style: TextStyle(fontSize: 40)),
                    const SizedBox(width: 8),
                    Text('Yalla',
                        style: TextStyle(
                          fontSize: 44,
                          fontWeight: FontWeight.bold,
                          color: YallaColors.primaryDeep,
                        )),
                  ],
                ),
                const SizedBox(height: 8),
                Text(_isRegister ? 'إنشاء حساب جديد' : 'سجّل دخولك للمتابعة',
                    style: const TextStyle(color: YallaColors.muted, fontSize: 15)),
                const SizedBox(height: 28),

                // الاسم واسم العائلة (للتسجيل فقط)
                if (_isRegister) ...[
                  TextFormField(
                    controller: _name,
                    decoration: const InputDecoration(
                      labelText: 'الاسم الأول',
                      prefixIcon: Icon(Icons.person_outline),
                    ),
                    validator: (v) => (v == null || v.isEmpty) ? 'أدخل الاسم الأول' : null,
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _lastName,
                    decoration: const InputDecoration(
                      labelText: 'اسم العائلة',
                      prefixIcon: Icon(Icons.badge_outlined),
                    ),
                    validator: (v) => (v == null || v.isEmpty) ? 'أدخل اسم العائلة' : null,
                  ),
                  const SizedBox(height: 16),

                  // Card 96: مكان السكن — المحافظة (قائمة) + تفاصيل العنوان
                  DropdownButtonFormField<String>(
                    value: _governorate,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'المحافظة (مكان السكن)',
                      prefixIcon: Icon(Icons.location_city_outlined),
                    ),
                    items: _governorates
                        .map((g) => DropdownMenuItem(value: g, child: Text(g)))
                        .toList(),
                    onChanged: (v) => setState(() => _governorate = v),
                    validator: (v) => (v == null || v.isEmpty) ? 'اختر المحافظة' : null,
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _address,
                    decoration: const InputDecoration(
                      labelText: 'تفاصيل العنوان',
                      prefixIcon: Icon(Icons.home_outlined),
                    ),
                    validator: (v) => (v == null || v.isEmpty) ? 'أدخل تفاصيل العنوان' : null,
                  ),
                  const SizedBox(height: 16),
                ],

                TextFormField(
                  controller: _phone,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(
                    labelText: 'رقم الهاتف',
                    prefixIcon: Icon(Icons.phone_outlined),
                  ),
                  validator: (v) => (v == null || v.length < 6) ? 'أدخل رقم هاتف صحيح' : null,
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

                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: const TextStyle(color: YallaColors.error), textAlign: TextAlign.center),
                ],

                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _loading ? null : _submit,
                    child: _loading
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                        : Text(_isRegister ? 'إنشاء الحساب' : 'دخول'),
                  ),
                ),

                // التبديل بين الدخول والتسجيل
                TextButton(
                  onPressed: _loading
                      ? null
                      : () => setState(() {
                            _isRegister = !_isRegister;
                            _error = null;
                          }),
                  child: Text(_isRegister ? 'لديك حساب؟ سجّل الدخول' : 'ليس لديك حساب؟ أنشئ حسابًا'),
                ),

                // Card 79: عند إنشاء حساب — خيار التسجيل ككابتن توصيل (طلب توثيق)
                if (_isRegister)
                  OutlinedButton.icon(
                    onPressed: _loading
                        ? null
                        : () => Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => CaptainSignupScreen(api: widget.authRepository.api),
                              ),
                            ),
                    icon: const Icon(Icons.two_wheeler),
                    label: const Text('تسجيل ككابتن توصيل'),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _name.dispose();
    _lastName.dispose();
    _phone.dispose();
    _password.dispose();
    _address.dispose();
    super.dispose();
  }
}
