import 'package:flutter_test/flutter_test.dart';
import 'package:yalla/core/network/network_error.dart';

void main() {
  test('offline error explains that connectivity should be checked', () {
    expect(networkFailureMessage(), contains('الإنترنت'));
  });
  test('write network errors warn users to verify request result before retrying', () {
    expect(writeNetworkFailureMessage(), contains('تحقق من حالتها'));
    expect(writeNetworkFailureMessage(timedOut: true), contains('مهلة الاتصال'));
    expect(writeNetworkFailureMessage(timedOut: true), contains('قبل إعادة المحاولة'));
  });
  test('timeout error is different and actionable', () {
    expect(networkFailureMessage(timedOut: true), contains('مهلة الاتصال'));
    expect(networkFailureMessage(timedOut: true), isNot(networkFailureMessage()));
  });
}
