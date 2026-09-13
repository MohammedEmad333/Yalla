class AppConfig {
  static const String origin = String.fromEnvironment(
    'API_ORIGIN',
    defaultValue: 'https://yalla-api.duckdns.org',
  );
  static const String apiBaseUrl = '$origin/api';

  static String imageUrl(String? value) {
    if (value == null || value.isEmpty) return '';
    return value.startsWith('http') ? value : '$origin$value';
  }
}
