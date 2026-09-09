import 'package:flutter_test/flutter_test.dart';
import 'package:yalla/core/onboarding/onboarding.dart';

void main() {
  test('علامة مشاهدة الشرح تقبل التخزين الجديد والقديم', () {
    expect(isOnboardingSeenValue('true'), isTrue);
    expect(isOnboardingSeenValue('1'), isTrue);
    expect(isOnboardingSeenValue('5'), isTrue);
    expect(isOnboardingSeenValue(null), isFalse);
    expect(isOnboardingSeenValue('0'), isFalse);
    expect(isOnboardingSeenValue('false'), isFalse);
  });
}
