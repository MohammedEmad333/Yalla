// طبقة المستودع (Repository) للمصادقة — الوسيط بين طبقة العرض والـ API.
// تعزل الشاشات عن تفاصيل الشبكة وتتولّى حفظ/محو التوكن.

import '../../../core/network/api_client.dart';
import '../../../core/storage/token_storage.dart';

// نموذج مبسّط للحساب الحالي
class AuthSession {
  final String role; // user | captain | admin
  final Map<String, dynamic> profile;
  AuthSession(this.role, this.profile);
}

class AuthRepository {
  final ApiClient _api;
  final TokenStorage _tokens;
  AuthRepository(this._api, this._tokens);

  // تسجيل مستخدم جديد ثم حفظ التوكن
  Future<AuthSession> registerUser({
    required String name,
    required String phone,
    required String password,
    String? email,
  }) async {
    final data = await _api.post('/auth/register', {
      'name': name,
      'phone': phone,
      'password': password,
      if (email != null) 'email': email,
    });
    await _tokens.save(data['token']);
    return AuthSession(data['user']['role'], data['user']);
  }

  // دخول المستخدم/الأدمن
  Future<AuthSession> loginUser({required String phone, required String password}) async {
    final data = await _api.post('/auth/login', {'phone': phone, 'password': password});
    await _tokens.save(data['token']);
    return AuthSession(data['user']['role'], data['user']);
  }

  // دخول الكابتن
  Future<AuthSession> loginCaptain({required String phone, required String password}) async {
    final data = await _api.post('/auth/captain/login', {'phone': phone, 'password': password});
    await _tokens.save(data['token']);
    return AuthSession('captain', data['captain']);
  }

  // استعادة الجلسة عند فتح التطبيق (إن وُجد توكن صالح)
  Future<AuthSession?> restoreSession() async {
    final token = await _tokens.read();
    if (token == null) return null;
    try {
      final data = await _api.get('/auth/me');
      final role = data['role'] as String;
      return AuthSession(role, role == 'captain' ? data['captain'] : data['user']);
    } on ApiException {
      await _tokens.clear(); // توكن منتهٍ/غير صالح → نظّفه
      return null;
    }
  }

  Future<void> logout() => _tokens.clear();
}
