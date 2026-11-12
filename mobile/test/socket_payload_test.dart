import 'package:flutter_test/flutter_test.dart';
import 'package:yalla/core/realtime/socket_payload.dart';

void main() {
  test('accepts string-keyed event payloads', () {
    expect(parseSocketPayload({'orderId': 'a', 'status': 'assigned'}),
        {'orderId': 'a', 'status': 'assigned'});
    expect(parseSocketPayload(<String, dynamic>{}), isEmpty);
  });

  test('ignores unexpected event payloads without casting errors', () {
    for (final value in [null, '', 123, true, <dynamic>[1, 2], {1: 'wrong-key'}]) {
      expect(parseSocketPayload(value), isNull);
    }
  });
}
