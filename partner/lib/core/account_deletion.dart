import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

const accountDeletionUrl = 'https://yalladelivery.org/delete-account.html#section-2';

/// Opens the official request procedure. Merchants may have outstanding
/// operational/financial records requiring review before account deletion.
Future<void> openAccountDeletion(BuildContext context) async {
  try {
    final opened = await launchUrl(
      Uri.parse(accountDeletionUrl),
      mode: LaunchMode.externalApplication,
    );
    if (!opened) throw StateError('Could not open account deletion page');
  } catch (_) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('تعذّر فتح صفحة حذف الحساب. حاول مجددًا.')),
    );
  }
}
