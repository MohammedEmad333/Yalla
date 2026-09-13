import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import 'app_config.dart';
import 'token_storage.dart';

class ApiException implements Exception {
  final int statusCode;
  final String message;
  ApiException(this.statusCode, this.message);
  @override
  String toString() => message;
}

class ApiClient {
  final TokenStorage tokens;
  ApiClient(this.tokens);

  Future<Map<String, String>> _headers() async {
    final token = await tokens.read();
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  Future<dynamic> get(String path) async => _handle(await http.get(
        Uri.parse('${AppConfig.apiBaseUrl}$path'),
        headers: await _headers(),
      ));

  Future<dynamic> post(String path, [Map<String, dynamic>? body]) async =>
      _handle(await http.post(
        Uri.parse('${AppConfig.apiBaseUrl}$path'),
        headers: await _headers(),
        body: jsonEncode(body ?? {}),
      ));

  Future<dynamic> patch(String path, Map<String, dynamic> body) async =>
      _handle(await http.patch(
        Uri.parse('${AppConfig.apiBaseUrl}$path'),
        headers: await _headers(),
        body: jsonEncode(body),
      ));

  Future<dynamic> delete(String path) async => _handle(await http.delete(
        Uri.parse('${AppConfig.apiBaseUrl}$path'),
        headers: await _headers(),
      ));

  Future<dynamic> uploadImage(String path, String filePath) async {
    final request = http.MultipartRequest(
      'POST',
      Uri.parse('${AppConfig.apiBaseUrl}$path'),
    );
    final token = await tokens.read();
    if (token != null) request.headers['Authorization'] = 'Bearer $token';
    request.files.add(await http.MultipartFile.fromPath(
      'image',
      filePath,
      contentType: _imageType(filePath),
    ));
    return _handle(await http.Response.fromStream(await request.send()));
  }

  MediaType _imageType(String path) {
    final value = path.toLowerCase();
    if (value.endsWith('.png')) return MediaType('image', 'png');
    if (value.endsWith('.webp')) return MediaType('image', 'webp');
    return MediaType('image', 'jpeg');
  }

  dynamic _handle(http.Response response) {
    dynamic data;
    try {
      data = response.body.isEmpty ? null : jsonDecode(response.body);
    } catch (_) {
      data = null;
    }
    if (response.statusCode >= 200 && response.statusCode < 300) return data;
    throw ApiException(
      response.statusCode,
      data is Map && data['message'] != null
          ? data['message'].toString()
          : 'تعذّر الاتصال بالخادم',
    );
  }
}
