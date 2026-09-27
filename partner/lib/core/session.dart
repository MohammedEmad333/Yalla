import 'package:flutter/foundation.dart';

import 'api_client.dart';
import 'token_storage.dart';

class PartnerSession {
  final ApiClient api;
  final TokenStorage tokens;
  PartnerSession(this.api, this.tokens);

  final ValueNotifier<Map<String, dynamic>?> merchant = ValueNotifier(null);

  Map<String, dynamic> _normalizedMerchant(Map raw) {
    final data = Map<String, dynamic>.from(raw);
    data['role'] = 'merchant';
    data['staffRole'] ??= 'owner';
    data['applicationStatus'] ??= 'approved';
    return data;
  }

  Future<void> login(String phone, String password) async {
    final data = await api.post('/merchant-staff/login', {'phone': phone, 'password': password});
    final user = _normalizedMerchant(data['user'] as Map);
    if (user['role'] != 'merchant') {
      throw ApiException(403, 'هذا التطبيق مخصّص لحسابات المطاعم والمحلات');
    }
    await tokens.save(data['token'] as String);
    merchant.value = user;
  }

  Future<void> register(Map<String, dynamic> payload) async {
    final data = await api.post('/merchant-staff/register', payload);
    final user = _normalizedMerchant(data['user'] as Map);
    await tokens.save(data['token'] as String);
    merchant.value = user;
  }

  Future<void> restore() async {
    if (await tokens.read() == null) return;
    try {
      final me = await api.get('/auth/me');
      if (me['role'] != 'merchant') throw ApiException(403, 'نوع الحساب غير صالح');

      final authMerchant = _normalizedMerchant(me['merchant'] as Map);
      if (authMerchant['applicationStatus'] != 'approved') {
        merchant.value = authMerchant;
        return;
      }

      final profile = await api.get('/merchant/profile');
      merchant.value = _normalizedMerchant(profile as Map);
    } catch (_) {
      await tokens.clear();
      merchant.value = null;
    }
  }

  Future<void> refreshApplicationStatus() async {
    final me = await api.get('/auth/me');
    if (me['role'] != 'merchant') throw ApiException(403, 'نوع الحساب غير صالح');
    final authMerchant = _normalizedMerchant(me['merchant'] as Map);
    if (authMerchant['applicationStatus'] == 'approved') {
      final profile = await api.get('/merchant/profile');
      merchant.value = _normalizedMerchant(profile as Map);
    } else {
      merchant.value = authMerchant;
    }
  }

  Future<void> switchBranch(String restaurantId) async {
    final data = await api.post('/merchant/branches/$restaurantId/select');
    await tokens.save(data['token'] as String);
    merchant.value = _normalizedMerchant(data['user'] as Map);
  }

  Future<void> refreshProfile() async {
    final profile = await api.get('/merchant/profile');
    merchant.value = _normalizedMerchant(profile as Map);
  }

  Future<void> logout() async {
    await tokens.clear();
    merchant.value = null;
  }
}
