import 'package:flutter_test/flutter_test.dart';
import 'package:yalla_partner/core/account_deletion.dart';

void main() {
  test('Merchant deletion request points to official HTTPS instructions', () {
    final url = Uri.parse(accountDeletionUrl);
    expect(url.scheme, 'https');
    expect(url.host, 'yalladelivery.org');
    expect(url.path, '/delete-account.html');
  });
}
