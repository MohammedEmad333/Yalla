// تخزين آمن لتوكن الـ JWT مع كاش في الذاكرة.
// الكاش يضمن قراءة فوريّة وموثوقة للتوكن (التخزين الآمن قد يتأخّر/يتقطّع أحيانًا).

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class TokenStorage {
  static const _key = 'yalla_auth_token';
  final _storage = const FlutterSecureStorage();

  String? _cached; // نسخة في الذاكرة (مصدر الحقيقة أثناء الجلسة)

  Future<void> save(String token) async {
    _cached = token;
    await _storage.write(key: _key, value: token);
  }

  Future<String?> read() async {
    if (_cached != null) return _cached;
    _cached = await _storage.read(key: _key);
    return _cached;
  }

  Future<void> clear() async {
    _cached = null;
    await _storage.delete(key: _key);
  }
}
