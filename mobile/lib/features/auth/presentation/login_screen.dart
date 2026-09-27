// شاشة مصادقة موحّدة للجميع (مستخدم/كابتن/أدمن): دخول برقم الهاتف وكلمة المرور،
// مع إمكانية إنشاء حساب مستخدم. النجاح يحدّث حالة الجلسة فتنتقل الواجهة تلقائيًا.

import 'package:flutter/material.dart';

import '../../../core/network/api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/input_behavior.dart';

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
  final _email = TextEditingController();
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
          email: _email.text.trim(),
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

  Future<void> _forgotPassword() async {
    final emailController = TextEditingController();
    final email = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('نسيت كلمة المرور؟'),
        content: TextField(
          controller: emailController,
          keyboardType: TextInputType.emailAddress,
          textDirection: YallaInputBehavior.machineDirection,
          textAlign: YallaInputBehavior.machineAlign,
          decoration: const InputDecoration(
            labelText: 'البريد الإلكتروني المؤكّد',
            hintText: 'name@example.com',
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('إلغاء')),
          FilledButton(
            onPressed: () {
              final value = emailController.text.trim();
              if (value.isNotEmpty) Navigator.pop(ctx, value);
            },
            child: const Text('إرسال الرمز'),
          ),
        ],
      ),
    );
    emailController.dispose();
    if (email == null || !mounted) return;

    try {
      await widget.authRepository.requestPasswordReset(email);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
      return;
    }

    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('إذا كان البريد مرتبطًا بحساب مؤكّد، تم إرسال رمز إعادة التعيين')),
    );

    final codeController = TextEditingController();
    final passwordController = TextEditingController();
    final confirmController = TextEditingController();
    final payload = await showDialog<Map<String, String>>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('إعادة تعيين كلمة المرور'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: codeController,
              keyboardType: TextInputType.number,
              textDirection: YallaInputBehavior.machineDirection,
              textAlign: YallaInputBehavior.machineAlign,
              decoration: const InputDecoration(labelText: 'رمز التحقق المكوّن من 6 أرقام'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: passwordController,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'كلمة المرور الجديدة'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: confirmController,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'تأكيد كلمة المرور'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('إلغاء')),
          FilledButton(
            onPressed: () {
              final code = codeController.text.trim();
              final password = passwordController.text;
              if (code.length != 6) return;
              if (password.length < 6 || password != confirmController.text) return;
              Navigator.pop(ctx, {'code': code, 'password': password});
            },
            child: const Text('تعيين كلمة المرور'),
          ),
        ],
      ),
    );
    codeController.dispose();
    passwordController.dispose();
    confirmController.dispose();
    if (payload == null || !mounted) return;

    try {
      await widget.authRepository.resetPassword(
        email: email,
        code: payload['code']!,
        newPassword: payload['password']!,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم تغيير كلمة المرور بنجاح — يمكنك تسجيل الدخول الآن')),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Card(
              elevation: 0,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 30),
                child: Form(
                  key: _formKey,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                // شعار العلامة داخل دائرة برتقالية ناعمة
                Container(
                  width: 84,
                  height: 84,
                  decoration: BoxDecoration(
                    color: YallaColors.primaryContainer,
                    shape: BoxShape.circle,
                    border: Border.all(color: YallaColors.primary.withValues(alpha: 0.25)),
                  ),
                  child: Icon(Icons.two_wheeler, size: 42, color: YallaColors.primary),
                ),
                const SizedBox(height: 16),
                Text(
                  'Yalla',
                  style: TextStyle(
                    fontSize: 40,
                    fontWeight: FontWeight.w800,
                    color: YallaColors.primaryDeep,
                    letterSpacing: -1,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  _isRegister ? 'أنشئ حسابك للبدء' : 'سجّل دخولك للمتابعة',
                  style: TextStyle(color: YallaColors.muted, fontSize: 15),
                ),
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
                  TextFormField(
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    textDirection: YallaInputBehavior.machineDirection,
                    textAlign: YallaInputBehavior.machineAlign,
                    decoration: const InputDecoration(
                      labelText: 'البريد الإلكتروني (اختياري)',
                      prefixIcon: Icon(Icons.email_outlined),
                      helperText: 'إذا أضفته سنرسل رمز تحقق ويمكنك استخدامه لاستعادة كلمة المرور',
                    ),
                    validator: (v) {
                      final value = (v ?? '').trim();
                      if (value.isEmpty) return null;
                      return RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+                  DropdownButtonFormField<String>(
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
                  textDirection: YallaInputBehavior.machineDirection,
                  textAlign: YallaInputBehavior.machineAlign,
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
                  textDirection: YallaInputBehavior.machineDirection,
                  textAlign: YallaInputBehavior.machineAlign,
                  decoration: const InputDecoration(
                    labelText: 'كلمة المرور',
                    prefixIcon: Icon(Icons.lock_outline),
                  ),
                  validator: (v) => (v == null || v.length < 6) ? '6 أحرف على الأقل' : null,
                ),
                if (!_isRegister)
                  Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: TextButton(
                      onPressed: _loading ? null : _forgotPassword,
                      child: const Text('نسيت كلمة المرور؟'),
                    ),
                  ),

                if (_error != null) ...[
                  const SizedBox(height: 16),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    decoration: BoxDecoration(
                      color: YallaColors.errorContainer,
                      borderRadius: BorderRadius.circular(YallaRadii.md),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.error_outline, color: YallaColors.error, size: 20),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(_error!, style: TextStyle(color: YallaColors.error)),
                        ),
                      ],
                    ),
                  ),
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
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _name.dispose();
    _lastName.dispose();
    _email.dispose();
    _phone.dispose();
    _password.dispose();
    _address.dispose();
    super.dispose();
  }
}
).hasMatch(value)
                          ? null
                          : 'أدخل بريدًا إلكترونيًا صحيحًا';
                    },
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
                  textDirection: YallaInputBehavior.machineDirection,
                  textAlign: YallaInputBehavior.machineAlign,
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
                  textDirection: YallaInputBehavior.machineDirection,
                  textAlign: YallaInputBehavior.machineAlign,
                  decoration: const InputDecoration(
                    labelText: 'كلمة المرور',
                    prefixIcon: Icon(Icons.lock_outline),
                  ),
                  validator: (v) => (v == null || v.length < 6) ? '6 أحرف على الأقل' : null,
                ),

                if (_error != null) ...[
                  const SizedBox(height: 16),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    decoration: BoxDecoration(
                      color: YallaColors.errorContainer,
                      borderRadius: BorderRadius.circular(YallaRadii.md),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.error_outline, color: YallaColors.error, size: 20),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(_error!, style: TextStyle(color: YallaColors.error)),
                        ),
                      ],
                    ),
                  ),
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
