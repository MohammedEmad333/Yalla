/// Socket events from the server or proxies can contain non-map values.
/// Ignore them rather than throwing in the realtime event dispatcher.
Map<String, dynamic>? parseSocketPayload(dynamic data) {
  if (data is! Map) return null;
  if (data.keys.any((key) => key is! String)) return null;
  return Map<String, dynamic>.from(data);
}
