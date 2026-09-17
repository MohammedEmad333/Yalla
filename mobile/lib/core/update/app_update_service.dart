import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../network/api_client.dart';

class AppUpdateService {
  AppUpdateService(this.api);

  final ApiClient api;
  bool _dialogVisible = false;
  String? _lastPromptedVersion;

  int _compareVersions(String a, String b) {
    final aa = a.split('.').map((e) => int.tryParse(e) ?? 0).toList();
    final bb = b.split('.').map((e) => int.tryParse(e) ?? 0).toList();
    final length = aa.length > bb.length ? aa.length : bb.length;
    for (var i = 0; i < length; i++) {
      final av = i < aa.length ? aa[i] : 0;
      final bv = i < bb.length ? bb[i] : 0;
      if (av != bv) return av.compareTo(bv);
    }
    return 0;
  }

  Future<void> checkAndShow(BuildContext context, {bool forceRefresh = false}) async {
    if (_dialogVisible || !context.mounted) return;
    try {
      final info = await PackageInfo.fromPlatform();
      final data = await api.get('/app-update');
      if (data is! Map || data['enabled'] == false) return;

      final current = info.version;
      final latest = (data['latestVersion'] ?? current).toString();
      final minimum = (data['minimumVersion'] ?? latest).toString();
      final serverForce = data['forceUpdate'] == true;
      final hasUpdate = _compareVersions(current, latest) < 0;
      if (!hasUpdate) return;

      final mustUpdate = serverForce || _compareVersions(current, minimum) < 0;
      if (!mustUpdate && !forceRefresh && _lastPromptedVersion == latest) return;
      _lastPromptedVersion = latest;
      if (!context.mounted) return;

      _dialogVisible = true;
      await showDialog<void>(
        context: context,
        barrierDismissible: !mustUpdate,
        builder: (dialogContext) => PopScope(
          canPop: !mustUpdate,
          child: AlertDialog(
            title: Text((data['title'] ?? 'يتوفر إصدار جديد من Yalla').toString()),
            content: Text((data['message'] ?? 'حدّث الآن للحصول على أحدث التحسينات وأفضل تجربة استخدام.').toString()),
            actions: [
              if (!mustUpdate)
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child: const Text('لاحقًا'),
                ),
              FilledButton.icon(
                onPressed: () async {
                  final url = Uri.tryParse((data['androidStoreUrl'] ?? '').toString());
                  if (url != null) await launchUrl(url, mode: LaunchMode.externalApplication);
                  if (!mustUpdate && dialogContext.mounted) Navigator.of(dialogContext).pop();
                },
                icon: const Icon(Icons.system_update_alt),
                label: const Text('تحديث الآن'),
              ),
            ],
          ),
        ),
      );
    } catch (_) {
      // فشل فحص التحديث لا يمنع المستخدم من تشغيل التطبيق.
    } finally {
      _dialogVisible = false;
    }
  }
}
