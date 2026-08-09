// عميل HTTP موحّد لكل التطبيق — يضيف الـ baseUrl وترويسة التوكن تلقائيًا.
// (يعتمد على حزمة http؛ يمكن استبداله بـ dio دون تغيير الطبقات الأعلى.)

import 'dart:convert';
import 'package:http/http.dart' as http;

import '../storage/token_storage.dart';

class ApiException implements Exception {
  final int statusCode;
  final String message;
  ApiException(this.statusCode, this.message);
  @override
  String toString() => 'ApiException($statusCode): $message';
}

class ApiClient {
  // غيّر العنوان حسب بيئتك (10.0.2.2 = localhost لمحاكي أندرويد)
  static const String baseUrl = 'http://10.0.2.2:4000/api';

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

  // توحيد معالجة الاستجابة والأخطاء
  dynamic _handle(http.Response res) {
    final data = res.body.isNotEmpty ? jsonDecode(res.body) : null;
    if (res.statusCode >= 200 && res.statusCode < 300) return data;
    final msg = (data is Map && data['message'] != null) ? data['message'] : 'خطأ غير متوقّع';
    throw ApiException(res.statusCode, msg);
  }
}
