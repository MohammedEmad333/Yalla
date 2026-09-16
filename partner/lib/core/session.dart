import 'package:flutter/foundation.dart';

import 'api_client.dart';
import 'token_storage.dart';

class PartnerSession {
  final ApiClient api;
  final TokenStorage tokens;
  PartnerSession(this.api, this.tokens);

  final ValueNotifier<Map<String, dynamic>?> merchant = ValueNotifier(null);

  Future<void> login(String phone, String password) async {
    final data = await api.post('/merchant-staff/login', {'phone': phone, 'password': password});
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
      final me = await api.get('/auth/me');
      if (me['role'] != 'merchant') throw ApiException(403, 'نوع الحساب غير صالح');
      final profile = await api.get('/merchant/profile');
      merchant.value = Map<String, dynamic>.from(profile as Map);
    } catch (_) {
      await tokens.clear();
      merchant.value = null;
    }
  }

  Future<void> switchBranch(String restaurantId) async {
    final data = await api.post('/merchant/branches/$restaurantId/select');
    await tokens.save(data['token'] as String);
    merchant.value = Map<String, dynamic>.from(data['user'] as Map);
  }

  Future<void> refreshProfile() async {
    final profile = await api.get('/merchant/profile');
    merchant.value = Map<String, dynamic>.from(profile as Map);
  }

  Future<void> logout() async {
    await tokens.clear();
    merchant.value = null;
  }
}
