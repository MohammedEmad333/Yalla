import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class CartStorage {
  static const _storage = FlutterSecureStorage();
  static const _key = 'yalla_restaurant_cart_v1';

  static Future<void> save({required String restaurantId, required List<Map<String, dynamic>> items}) async {
    if (items.isEmpty) return clear();
    await _storage.write(key: _key, value: jsonEncode({
      'restaurantId': restaurantId,
      'items': items,
      'savedAt': DateTime.now().toIso8601String(),
    }));
  }

  static Future<Map<String, dynamic>?> read() async {
    final raw = await _storage.read(key: _key);
    if (raw == null || raw.isEmpty) return null;
    try {
      final data = Map<String, dynamic>.from(jsonDecode(raw) as Map);
      final savedAt = DateTime.tryParse(data['savedAt']?.toString() ?? '');
      if (savedAt != null && DateTime.now().difference(savedAt).inDays > 7) {
        await clear();
        return null;
      }
      return data;
    } catch (_) {
      await clear();
      return null;
    }
  }

  static Future<void> clear() => _storage.delete(key: _key);
}
