import 'package:flutter/foundation.dart';

import 'api_client.dart';
import 'token_storage.dart';

class PartnerSession {
  final ApiClient api;
  final TokenStorage tokens;
  PartnerSession(this.api, this.tokens);

  final ValueNotifier<Map<String, dynamic>?> merchant = ValueNotifier(null);

  Future<void> login(String phone, String password) async {
    final data = await api.post('/auth/login', {'phone': phone, 'password': password});
    final user = Map<String, dynamic>.from(data['user'] as Map);
    if (user['role'] != 'merchant') {
      throw ApiException(403, 'هذا التطبيق مخصّص لحسابات المطاعم والمحلات');
    }
    await tokens.save(data['token'] as String);
    merchant.value = user;
  }

  Future<void> restore() async {
    if (await tokens.read() == null) return;
    try {
      final data = await api.get('/auth/me');
      if (data['role'] != 'merchant') throw ApiException(403, 'نوع الحساب غير صالح');
      merchant.value = Map<String, dynamic>.from(data['merchant'] as Map);
    } catch (_) {
      await tokens.clear();
      merchant.value = null;
    }
  }

  Future<void> logout() async {
    await tokens.clear();
    merchant.value = null;
  }
}
