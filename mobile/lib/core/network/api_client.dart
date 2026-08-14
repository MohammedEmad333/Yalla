// عميل HTTP موحّد لكل التطبيق — يضيف الـ baseUrl وترويسة التوكن تلقائيًا.
// (يعتمد على حزمة http؛ يمكن استبداله بـ dio دون تغيير الطبقات الأعلى.)

import 'dart:convert';
import 'package:http/http.dart' as http;

import '../config/app_config.dart';
import '../storage/token_storage.dart';

class ApiException implements Exception {
  final int statusCode;
  final String message;
  ApiException(this.statusCode, this.message);
  @override
  String toString() => 'ApiException($statusCode): $message';
}

class ApiClient {
  // العنوان يُضبط عبر --dart-define=API_HOST=... (راجع AppConfig)
  static const String baseUrl = AppConfig.apiBaseUrl;

  final TokenStorage _tokenStorage;
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
    final res = await http.post(
      Uri.parse('$baseUrl$path'),
      headers: await _headers(),
      body: jsonEncode(body),
    );
    return _handle(res);
  }

  Future<dynamic> get(String path) async {
    final res = await http.get(Uri.parse('$baseUrl$path'), headers: await _headers());
    return _handle(res);
  }

  Future<dynamic> patch(String path, Map<String, dynamic> body) async {
    final res = await http.patch(
      Uri.parse('$baseUrl$path'),
      headers: await _headers(),
      body: jsonEncode(body),
    );
    return _handle(res);
  }

  Future<dynamic> delete(String path, [Map<String, dynamic>? body]) async {
    final res = await http.delete(
      Uri.parse('$baseUrl$path'),
      headers: await _headers(),
      body: body != null ? jsonEncode(body) : null,
    );
    return _handle(res);
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
      req.files.add(await http.MultipartFile.fromPath(fileField, filePath));
    }
    final streamed = await req.send();
    final res = await http.Response.fromStream(streamed);
    return _handle(res);
  }

  // توحيد معالجة الاستجابة والأخطاء
  dynamic _handle(http.Response res) {
    final data = res.body.isNotEmpty ? jsonDecode(res.body) : null;
    if (res.statusCode >= 200 && res.statusCode < 300) return data;
    final msg = (data is Map && data['message'] != null) ? data['message'] : 'خطأ غير متوقّع';
    throw ApiException(res.statusCode, msg);
  }
}
