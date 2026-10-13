import 'package:flutter_test/flutter_test.dart';
import 'package:yalla/features/captain/claim_error_policy.dart';

void main() {
  test('claim conflicts remove the unavailable broadcast', () {
    expect(shouldRemoveClaimOnError(409), isTrue);
  });
  test('network failures and server errors do not discard broadcasts', () {
    for (final status in [0, 400, 401, 408, 429, 500, 502, 503, 504]) {
      expect(shouldRemoveClaimOnError(status), isFalse);
    }
  });
}
