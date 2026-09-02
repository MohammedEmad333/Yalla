// تخزين آمن ودائم لتوكن الـ JWT مع كاش في الذاكرة.
// الكاش يضمن قراءة فوريّة أثناء الجلسة، والتخزين الآمن يُبقي الجلسة محفوظة حتى
// بعد إغلاق التطبيق تمامًا فلا يُطلب تسجيل الدخول في كل مرّة.
//
// نستخدم EncryptedSharedPreferences على أندرويد بدل مخزن Keystore الافتراضي:
// الأخير قد تُبطَل مفاتيحه أحيانًا على بعض الأجهزة فتُفقد الجلسة عند إعادة التشغيل،
// بينما EncryptedSharedPreferences أكثر موثوقيّة للبقاء بعد إغلاق التطبيق.

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class TokenStorage {
  static const _key = 'yalla_auth_token';

  // خيارات أندرويد: تخزين مشفّر ودائم يبقى بعد إغلاق التطبيق وإعادة تشغيله.
  static const _aOptions = AndroidOptions(encryptedSharedPreferences: true);
  // خيارات iOS: يبقى التوكن بعد أوّل فتح للجهاز (متاح حتى بعد إعادة التشغيل).
  static const _iOptions = IOSOptions(accessibility: KeychainAccessibility.first_unlock);

  final _storage = const FlutterSecureStorage(
    aOptions: _aOptions,
    iOptions: _iOptions,
  );

  String? _cached; // نسخة في الذاكرة (مصدر الحقيقة أثناء الجلسة)

  Future<void> save(String token) async {
    _cached = token;
    await _storage.write(key: _key, value: token, aOptions: _aOptions, iOptions: _iOptions);
  }

  Future<String?> read() async {
    if (_cached != null) return _cached;
    try {
      _cached = await _storage.read(key: _key, aOptions: _aOptions, iOptions: _iOptions);
    } catch (_) {
      // تعذّرت قراءة المخزن الآمن (نادر) — نُبقي الكاش كما هو (قد يكون فارغًا)
    }
    return _cached;
  }

  Future<void> clear() async {
    _cached = null;
    try {
      await _storage.delete(key: _key, aOptions: _aOptions, iOptions: _iOptions);
    } catch (_) {
      // نتجاهل — الخروج يجب أن يكتمل على أي حال
    }
  }
}
