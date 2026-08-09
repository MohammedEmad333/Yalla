// شاشة إنشاء حساب مستخدم جديد (العميل فقط).

import 'package:flutter/material.dart';

import '../data/auth_repository.dart';

class RegisterScreen extends StatefulWidget {
  final AuthRepository authRepository;
  final VoidCallback onRegistered; // ننتقل للرئيسية بعد النجاح
  final VoidCallback onBackToLogin;

  const RegisterScreen({
    super.key,
    required this.authRepository,
    required this.onRegistered,
    required this.onBackToLogin,
  });

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
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
      await widget.authRepository.registerUser(
        name: _name.text,
        phone: _phone.text,
        password: _password.text,
        email: _email.text.isEmpty ? null : _email.text,
      );
      if (mounted) widget.onRegistered();
    } catch (e) {
      setState(() => _error = 'تعذّر إنشاء الحساب — قد يكون الهاتف مستخدمًا');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('إنشاء حساب')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Form(
          key: _formKey,
          child: Column(
            children: [
              _field(_name, 'الاسم', Icons.person),
              const SizedBox(height: 16),
              _field(_phone, 'رقم الهاتف', Icons.phone, keyboard: TextInputType.phone),
              const SizedBox(height: 16),
              _field(_email, 'البريد (اختياري)', Icons.email, required: false),
              const SizedBox(height: 16),
              _field(_password, 'كلمة المرور', Icons.lock, obscure: true),

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
                      : const Text('إنشاء الحساب'),
                ),
              ),
              TextButton(onPressed: widget.onBackToLogin, child: const Text('لديك حساب؟ سجّل الدخول')),
            ],
          ),
        ),
      ),
    );
  }

  // حقل إدخال قابل لإعادة الاستخدام مع تحقّق بسيط
  Widget _field(
    TextEditingController c,
    String label,
    IconData icon, {
    bool obscure = false,
    bool required = true,
    TextInputType? keyboard,
  }) {
    return TextFormField(
      controller: c,
      obscureText: obscure,
      keyboardType: keyboard,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon),
        border: const OutlineInputBorder(),
      ),
      validator: required ? (v) => (v == null || v.isEmpty) ? 'حقل مطلوب' : null : null,
    );
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }
}
