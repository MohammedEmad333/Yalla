// شاشة تسجيل الدخول — مشتركة بين تطبيق المستخدم والكابتن عبر معامل [role].
// تطبيق React Native/Flutter نظيف: الشاشة تستدعي AuthRepository فقط.

import 'package:flutter/material.dart';

import '../data/auth_repository.dart';

class LoginScreen extends StatefulWidget {
  final AuthRepository authRepository;
  final bool isCaptain; // true = دخول كابتن، false = دخول مستخدم
  final VoidCallback onLoggedIn; // ننتقل للشاشة الرئيسية بعد النجاح
  final VoidCallback? onGoToRegister;

  const LoginScreen({
    super.key,
    required this.authRepository,
    required this.onLoggedIn,
    this.isCaptain = false,
    this.onGoToRegister,
  });

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  bool _loading = false;
  String? _error;

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      // نختار نوع الدخول حسب الدور
      if (widget.isCaptain) {
        await widget.authRepository.loginCaptain(phone: _phone.text, password: _password.text);
      } else {
        await widget.authRepository.loginUser(phone: _phone.text, password: _password.text);
      }
      if (mounted) widget.onLoggedIn();
    } catch (e) {
      setState(() => _error = 'فشل الدخول: تحقّق من الهاتف وكلمة المرور');
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
                const Text('🛵 يلا', style: TextStyle(fontSize: 40, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Text(widget.isCaptain ? 'دخول الكابتن' : 'أهلًا بك',
                    style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 32),

                TextFormField(
                  controller: _phone,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(
                    labelText: 'رقم الهاتف',
                    prefixIcon: Icon(Icons.phone),
                    border: OutlineInputBorder(),
                  ),
                  validator: (v) => (v == null || v.length < 6) ? 'أدخل رقم هاتف صحيح' : null,
                ),
                const SizedBox(height: 16),

                TextFormField(
                  controller: _password,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'كلمة المرور',
                    prefixIcon: Icon(Icons.lock),
                    border: OutlineInputBorder(),
                  ),
                  validator: (v) => (v == null || v.length < 6) ? '6 أحرف على الأقل' : null,
                ),

                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: const TextStyle(color: Colors.red)),
                ],

                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _loading ? null : _submit,
                    child: _loading
                        ? const SizedBox(
                            width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Text('تسجيل الدخول'),
                  ),
                ),

                // رابط إنشاء الحساب (للمستخدم فقط — الكباتن يُنشئهم الأدمن)
                if (!widget.isCaptain && widget.onGoToRegister != null)
                  TextButton(
                    onPressed: widget.onGoToRegister,
                    child: const Text('ليس لديك حساب؟ أنشئ حسابًا'),
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
    _phone.dispose();
    _password.dispose();
    super.dispose();
  }
}
