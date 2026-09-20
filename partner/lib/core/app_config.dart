class AppConfig {
  static const String origin = String.fromEnvironment(
    'API_ORIGIN',
    defaultValue: 'https://yalla-api.duckdns.org',
  );
  static const String apiBaseUrl = '$origin/api';

  static String imageUrl(String? value) {
    final raw = (value ?? '').trim();
    if (raw.isEmpty) return '';
    if (raw.startsWith('http://')) {
      return origin.startsWith('https://') ? 'https://${raw.substring(7)}' : raw;
    }
    if (raw.startsWith('https://')) return raw;
    if (raw.startsWith('/')) return '$origin$raw';
    return '$origin/$raw';
  }
}
