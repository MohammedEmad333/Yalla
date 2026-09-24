// عميل HTTP موحّد لكل التطبيق — يضيف الـ baseUrl وترويسة التوكن تلقائيًا.
// (يعتمد على حزمة http؛ يمكن استبداله بـ dio دون تغيير الطبقات الأعلى.)

import 'dart:convert';
import 'dart:developer' as developer;
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart' show MediaType;

import '../config/app_config.dart';
import '../storage/token_storage.dart';

class ApiException implements Exception {
  final int statusCode;
  final String message;
  ApiException(this.statusCode, this.message);
  @override
  String toString() => 'ApiException($statusCode): $message';
}

class _GetCacheEntry {
  final dynamic value;
  final DateTime expiresAt;
  const _GetCacheEntry(this.value, this.expiresAt);

  bool get isFresh => DateTime.now().isBefore(expiresAt);
}

class ApiClient {
  // العنوان يُضبط عبر --dart-define=API_HOST=... (راجع AppConfig)
  static const String baseUrl = AppConfig.apiBaseUrl;

  final TokenStorage _tokenStorage;
  final Map<String, _GetCacheEntry> _getCache = {};
  final Map<String, Future<dynamic>> _inFlightGets = {};

  ApiClient(this._tokenStorage);

  // بناء الترويسات مع إرفاق التوكن إن وُجد
  Future<Map<String, String>> _headers() async {
    final token = await _tokenStorage.read();
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  Future<dynamic> post(String path, Map<String, dynamic> body) async {
    final stopwatch = (kDebugMode || kProfileMode) ? (Stopwatch()..start()) : null;
    final res = await http.post(
      Uri.parse('$baseUrl$path'),
      headers: await _headers(),
      body: jsonEncode(body),
    );
    stopwatch?.stop();
    if (stopwatch != null) _logRequest('POST', path, res, stopwatch.elapsedMilliseconds);
    final data = _handle(res);
    clearGetCache();
    return data;
  }

  Future<dynamic> get(String path) async {
    final existing = _inFlightGets[path];
    if (existing != null) return existing;

    final request = _performGet(path);
    _inFlightGets[path] = request;
    try {
      return await request;
    } finally {
      _inFlightGets.remove(path);
    }
  }

  Future<dynamic> _performGet(String path) async {
    final stopwatch = (kDebugMode || kProfileMode) ? (Stopwatch()..start()) : null;
    final res = await http.get(Uri.parse('$baseUrl$path'), headers: await _headers());
    stopwatch?.stop();
    if (stopwatch != null) {
      _logRequest('GET', path, res, stopwatch.elapsedMilliseconds);
    }
    return _handle(res);
  }

  /// Short-lived opt-in cache for read-heavy endpoints. Concurrent requests for
  /// the same path are also coalesced so a fast sequence of rebuilds cannot
  /// trigger duplicate HTTP calls.
  Future<dynamic> getCached(
    String path, {
    Duration ttl = const Duration(seconds: 20),
    bool forceRefresh = false,
  }) async {
    if (!forceRefresh) {
      final cached = _getCache[path];
      if (cached != null && cached.isFresh) {
        if (kDebugMode || kProfileMode) {
          developer.log('CACHE HIT $path', name: 'Yalla.Network');
        }
        return cached.value;
      }
    }

    final data = await get(path);
    _getCache[path] = _GetCacheEntry(data, DateTime.now().add(ttl));
    return data;
  }

  void clearGetCache({String? prefix}) {
    if (prefix == null) {
      _getCache.clear();
      return;
    }
    _getCache.removeWhere((path, _) => path.startsWith(prefix));
  }

  Future<dynamic> put(String path, dynamic body) async {
    final stopwatch = (kDebugMode || kProfileMode) ? (Stopwatch()..start()) : null;
    final res = await http.put(
      Uri.parse('$baseUrl$path'),
      headers: await _headers(),
      body: jsonEncode(body),
    );
    stopwatch?.stop();
    if (stopwatch != null) _logRequest('PUT', path, res, stopwatch.elapsedMilliseconds);
    final data = _handle(res);
    clearGetCache();
    return data;
  }

  Future<dynamic> patch(String path, Map<String, dynamic> body) async {
    final stopwatch = (kDebugMode || kProfileMode) ? (Stopwatch()..start()) : null;
    final res = await http.patch(
      Uri.parse('$baseUrl$path'),
      headers: await _headers(),
      body: jsonEncode(body),
    );
    stopwatch?.stop();
    if (stopwatch != null) _logRequest('PATCH', path, res, stopwatch.elapsedMilliseconds);
    final data = _handle(res);
    clearGetCache();
    return data;
  }

  Future<dynamic> delete(String path, [Map<String, dynamic>? body]) async {
    final stopwatch = (kDebugMode || kProfileMode) ? (Stopwatch()..start()) : null;
    final res = await http.delete(
      Uri.parse('$baseUrl$path'),
      headers: await _headers(),
      body: body != null ? jsonEncode(body) : null,
    );
    stopwatch?.stop();
    if (stopwatch != null) _logRequest('DELETE', path, res, stopwatch.elapsedMilliseconds);
    final data = _handle(res);
    clearGetCache();
    return data;
  }

  // رفع متعدّد الأجزاء (multipart) — لإرسال حقول نصّية مع ملفّ (صورة إيصال).
  // نمرّر التوكن يدويًّا لأنّ http.MultipartRequest لا يستخدم _headers.
  Future<dynamic> postMultipart(
    String path, {
    required Map<String, String> fields,
    String? filePath,
    String fileField = 'file',
  }) async {
    final req = http.MultipartRequest('POST', Uri.parse('$baseUrl$path'));
    final token = await _tokenStorage.read();
    if (token != null) req.headers['Authorization'] = 'Bearer $token';
    req.fields.addAll(fields);
    if (filePath != null && filePath.isNotEmpty) {
      // نحدّد نوع المحتوى صراحةً من الامتداد — وإلّا يُرسَل كـ octet-stream
      // فيرفضه فلتر الصور في الخادم.
      req.files.add(await http.MultipartFile.fromPath(
        fileField,
        filePath,
        contentType: _imageContentType(filePath),
      ));
    }
    final streamed = await req.send();
    final res = await http.Response.fromStream(streamed);
    final data = _handle(res);
    clearGetCache();
    return data;
  }

  // رفع متعدّد الأجزاء بعدّة ملفّات (Card 79) — حقول نصّية + عدّة صور
  // (مثلًا صورة الهوية والسيلفي). يعمل بلا توكن (تسجيل الكابتن عامّ).
  Future<dynamic> postMultipartFiles(
    String path, {
    required Map<String, String> fields,
    required Map<String, String> files, // اسم الحقل -> مسار الملفّ
  }) async {
    final req = http.MultipartRequest('POST', Uri.parse('$baseUrl$path'));
    final token = await _tokenStorage.read();
    if (token != null) req.headers['Authorization'] = 'Bearer $token';
    req.fields.addAll(fields);
    for (final entry in files.entries) {
      if (entry.value.isEmpty) continue;
      req.files.add(await http.MultipartFile.fromPath(
        entry.key,
        entry.value,
        contentType: _imageContentType(entry.value),
      ));
    }
    final streamed = await req.send();
    final res = await http.Response.fromStream(streamed);
    final data = _handle(res);
    clearGetCache();
    return data;
  }

  // نوع محتوى الصورة من امتداد الملفّ (افتراضيًّا jpeg)
  MediaType _imageContentType(String path) {
    final p = path.toLowerCase();
    if (p.endsWith('.png')) return MediaType('image', 'png');
    if (p.endsWith('.webp')) return MediaType('image', 'webp');
    if (p.endsWith('.heic')) return MediaType('image', 'heic');
    if (p.endsWith('.heif')) return MediaType('image', 'heif');
    return MediaType('image', 'jpeg');
  }

  // توحيد معالجة الاستجابة والأخطاء
  dynamic _handle(http.Response res) {
    final data = res.body.isNotEmpty ? jsonDecode(res.body) : null;
    if (res.statusCode >= 200 && res.statusCode < 300) return data;
    final msg = (data is Map && data['message'] != null) ? data['message'] : 'خطأ غير متوقّع';
    throw ApiException(res.statusCode, msg);
  }
}
