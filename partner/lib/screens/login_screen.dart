import 'package:flutter/material.dart';

import '../core/session.dart';

class LoginScreen extends StatefulWidget {
  final PartnerSession session;
  const LoginScreen({super.key, required this.session});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phone = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _hidden = true;
  String _error = '';

  @override
  void dispose() {
    _phone.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    FocusScope.of(context).unfocus();
    if (_phone.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _error = 'أدخل رقم الجوال وكلمة السر');
      return;
    }
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      await widget.session.login(_phone.text.trim(), _password.text);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          Positioned.fill(
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Color(0xFF071D3A), Color(0xFF0C2E59), Color(0xFFF4F6FA)],
                  stops: [0, .36, .36],
                ),
              ),
            ),
          ),
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 24, 20, 28),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 460),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Container(
                            width: 58,
                            height: 58,
                            decoration: BoxDecoration(
                              color: const Color(0xFFFF7A00),
                              borderRadius: BorderRadius.circular(18),
                            ),
                            child: const Icon(Icons.storefront_rounded, color: Colors.white, size: 31),
                          ),
                          const SizedBox(width: 14),
                          const Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Yalla Partner',
                                style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900),
                              ),
                              Text(
                                'إدارة متجرك بكل سهولة',
                                style: TextStyle(color: Color(0xFFCAD4E1), fontSize: 13),
                              ),
                            ],
                          ),
                        ],
                      ),
                      const SizedBox(height: 32),
                      Container(
                        padding: const EdgeInsets.all(22),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(28),
                          boxShadow: const [
                            BoxShadow(
                              color: Color(0x18071D3A),
                              blurRadius: 26,
                              offset: Offset(0, 10),
                            ),
                          ],
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const Text(
                              'أهلًا بعودتك 👋',
                              style: TextStyle(fontSize: 23, fontWeight: FontWeight.w900),
                            ),
                            const SizedBox(height: 6),
                            const Text(
                              'سجّل دخولك لمتابعة الطلبات وتحديث المنتجات وإعدادات المتجر.',
                              style: TextStyle(color: Color(0xFF7A8595), height: 1.55),
                            ),
                            const SizedBox(height: 24),
                            TextField(
                              controller: _phone,
                              keyboardType: TextInputType.phone,
                              textDirection: TextDirection.ltr,
                              decoration: const InputDecoration(
                                labelText: 'رقم الجوال',
                                prefixIcon: Icon(Icons.phone_rounded),
                              ),
                            ),
                            const SizedBox(height: 14),
                            TextField(
                              controller: _password,
                              obscureText: _hidden,
                              onSubmitted: (_) => _login(),
                              decoration: InputDecoration(
                                labelText: 'كلمة السر',
                                prefixIcon: const Icon(Icons.lock_rounded),
                                suffixIcon: IconButton(
                                  onPressed: () => setState(() => _hidden = !_hidden),
                                  icon: Icon(_hidden ? Icons.visibility_rounded : Icons.visibility_off_rounded),
                                ),
                              ),
                            ),
                            if (_error.isNotEmpty) ...[
                              const SizedBox(height: 14),
                              Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFFFEFEF),
                                  borderRadius: BorderRadius.circular(14),
                                ),
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Icon(Icons.error_outline_rounded, color: Color(0xFFC23A3A), size: 20),
                                    const SizedBox(width: 8),
                                    Expanded(child: Text(_error, style: const TextStyle(color: Color(0xFFC23A3A)))),
                                  ],
                                ),
                              ),
                            ],
                            const SizedBox(height: 20),
                            FilledButton.icon(
                              onPressed: _busy ? null : _login,
                              icon: _busy
                                  ? const SizedBox.square(
                                      dimension: 18,
                                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                    )
                                  : const Icon(Icons.arrow_forward_rounded),
                              label: Padding(
                                padding: const EdgeInsets.symmetric(vertical: 3),
                                child: Text(_busy ? 'جارٍ تسجيل الدخول...' : 'دخول إلى لوحة المتجر'),
                              ),
                            ),
                            const SizedBox(height: 16),
                            Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: const Color(0xFFF6F8FB),
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: const Row(
                                children: [
                                  Icon(Icons.info_outline_rounded, color: Color(0xFF657287), size: 20),
                                  SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      'يتم إنشاء حساب المتجر من الإدارة وإرسال بيانات الدخول لك.',
                                      style: TextStyle(color: Color(0xFF657287), fontSize: 12.5, height: 1.45),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
