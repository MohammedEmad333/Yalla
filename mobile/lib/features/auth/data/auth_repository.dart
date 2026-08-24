// طبقة مصادقة موحّدة — تحتفظ بحالة الجلسة الحالية عبر ValueNotifier،
// فتقود الواجهة مباشرةً (دون الاعتماد على نداءات إضافية للتنقّل).

import 'package:flutter/foundation.dart';

import '../../../core/network/api_client.dart';
import '../../../core/storage/token_storage.dart';

class AuthSession {
  final String role; // user | captain | admin
  final Map<String, dynamic> profile;
  AuthSession(this.role, this.profile);
}

class AuthRepository {
  final ApiClient _api;
  final TokenStorage _tokens;
  AuthRepository(this._api, this._tokens);

  // Card 79: عميل الـ API متاح لشاشات المصادقة العامّة (مثل تسجيل الكابتن)
  ApiClient get api => _api;

  // مصدر الحقيقة لحالة الدخول — تستمع إليه الواجهة
  final ValueNotifier<AuthSession?> session = ValueNotifier(null);

  AuthSession _fromUser(Map data) =>
      AuthSession(data['user']['role'], Map<String, dynamic>.from(data['user']));

  // دخول موحّد (مستخدم/كابتن/أدمن) — نقطة نهاية واحدة
  Future<void> login({required String phone, required String password}) async {
    final data = await _api.post('/auth/login', {'phone': phone, 'password': password});
    await _tokens.save(data['token']);
    session.value = _fromUser(data);
  }

  // إنشاء حساب مستخدم ثم دخوله
  Future<void> register({
    required String name,
    required String phone,
    required String password,
    String? lastName,
    String? email,
  }) async {
    final data = await _api.post('/auth/register', {
      'name': name,
      if (lastName != null && lastName.isNotEmpty) 'lastName': lastName,
      'phone': phone,
      'password': password,
      if (email != null && email.isNotEmpty) 'email': email,
    });
    await _tokens.save(data['token']);
    session.value = _fromUser(data);
  }

  // استعادة الجلسة عند إقلاع التطبيق (إن وُجد توكن صالح)
  Future<void> restore() async {
    final token = await _tokens.read();
    if (token == null) {
      session.value = null;
      return;
    }
    try {
      final data = await _api.get('/auth/me');
      final role = data['role'] as String;
      final profile = role == 'captain' ? data['captain'] : data['user'];
      session.value = AuthSession(role, Map<String, dynamic>.from(profile));
    } on ApiException {
      await _tokens.clear(); // توكن منتهٍ/غير صالح
      session.value = null;
    }
  }

  // تسجيل الخروج — يمحو التوكن ويعيد الواجهة لصفحة الدخول
  Future<void> logout() async {
    await _tokens.clear();
    session.value = null;
  }
}
