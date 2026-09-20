import 'package:flutter_test/flutter_test.dart';
import 'package:yalla/core/config/app_config.dart';

void main() {
  group('AppConfig.imageUrl', () {
    test('keeps HTTPS image URLs unchanged', () {
      expect(
        AppConfig.imageUrl('https://cdn.example.com/store.jpg'),
        'https://cdn.example.com/store.jpg',
      );
    });

    test('joins relative image URLs to the API origin', () {
      expect(
        AppConfig.imageUrl('/files/abc123'),
        '${AppConfig.origin}/files/abc123',
      );
    });

    test('upgrades HTTP image URLs when the API origin uses HTTPS', () {
      if (!AppConfig.origin.startsWith('https://')) return;
      expect(
        AppConfig.imageUrl('http://api.yalladelivery.org/files/abc123'),
        'https://api.yalladelivery.org/files/abc123',
      );
    });
  });
}
