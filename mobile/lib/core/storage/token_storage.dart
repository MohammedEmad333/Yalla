// تخزين آمن لتوكن الـ JWT على الجهاز.
// نستخدم flutter_secure_storage (Keychain/Keystore) بدل SharedPreferences
// لأن التوكن بيانات حسّاسة.

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class TokenStorage {
  static const _key = 'yalla_auth_token';
  final _storage = const FlutterSecureStorage();

  Future<void> save(String token) => _storage.write(key: _key, value: token);
  Future<String?> read() => _storage.read(key: _key);
  Future<void> clear() => _storage.delete(key: _key);
}
