import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/network/api_client.dart';

/// Captain-only Telegram pairing settings. Never logs or persists pairing codes.
class CaptainTelegramScreen extends StatefulWidget {
  final ApiClient api;
  const CaptainTelegramScreen({super.key, required this.api});

  @override
  State<CaptainTelegramScreen> createState() => _CaptainTelegramScreenState();
}

class _CaptainTelegramScreenState extends State<CaptainTelegramScreen> {
  bool _busy = false;
  bool? _linked;
  String? _code;
  DateTime? _expiresAt;
  String? _error;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    setState(() { _busy = true; _error = null; });
    try {
      final data = await widget.api.get('/telegram-captain/link') as Map;
      if (!mounted) return;
      setState(() { _linked = data['linked'] == true; if (_linked!) _code = null; });
    } catch (_) {
      if (mounted) setState(() => _error = 'تعذر التحقق من حالة الربط. حاول مجددًا.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _issue() async {
    setState(() { _busy = true; _error = null; _code = null; });
    try {
      final data = await widget.api.post('/telegram-captain/pairing-code', {}) as Map;
      if (!mounted) return;
      setState(() {
        _code = data['code'] as String?;
        _expiresAt = DateTime.now().add(Duration(seconds: (data['expiresInSeconds'] as num?)?.toInt() ?? 300));
      });
    } catch (_) {
      if (mounted) setState(() => _error = 'تعذر إصدار الرمز. تأكد من اعتماد حساب الكابتن.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _unlink() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('إلغاء ربط تيليجرام؟'),
        content: const Text('ستتوقف مزايا الربط المرتبطة بهذا الحساب.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('تراجع')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('إلغاء الربط')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() { _busy = true; _error = null; });
    try {
      await widget.api.delete('/telegram-captain/link');
      if (!mounted) return;
      setState(() { _linked = false; _code = null; });
    } catch (_) {
      if (mounted) setState(() => _error = 'تعذر إلغاء الربط.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final validCode = _code != null && _expiresAt != null && DateTime.now().isBefore(_expiresAt!);
    return Scaffold(
      appBar: AppBar(title: const Text('ربط تيليجرام')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text('اربط حساب الكابتن ببوت Yalla Delivery Captain. الرمز صالح لخمس دقائق ولمرة واحدة فقط.'),
          const SizedBox(height: 16),
          if (_busy) const LinearProgressIndicator(),
          if (_error != null) Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          const SizedBox(height: 12),
          Text(_linked == null ? 'حالة الربط غير معروفة' : _linked! ? 'الحساب مرتبط' : 'الحساب غير مرتبط'),
          const SizedBox(height: 12),
          OutlinedButton.icon(onPressed: _busy ? null : _refresh, icon: const Icon(Icons.refresh), label: const Text('تحديث حالة الربط')),
          if (_linked == false) ...[
            FilledButton.icon(onPressed: _busy ? null : _issue, icon: const Icon(Icons.key), label: const Text('إنشاء رمز ربط جديد')),
            if (validCode) ...[
              const SizedBox(height: 12),
              SelectableText(_code!, textAlign: TextAlign.center),
              TextButton.icon(
                onPressed: () => Clipboard.setData(ClipboardData(text: _code!)),
                icon: const Icon(Icons.copy),
                label: const Text('نسخ الرمز'),
              ),
              FilledButton.icon(
                onPressed: () => launchUrl(Uri.parse('https://t.me/YallaDeliveryCaptainBot'), mode: LaunchMode.externalApplication),
                icon: const Icon(Icons.send),
                label: const Text('فتح بوت تيليجرام'),
              ),
              const Text('أرسل إلى البوت: /start ثم مسافة ثم رمز الربط. بعد ذلك اضغط تحديث حالة الربط.'),
            ],
          ],
          if (_linked == true)
            OutlinedButton.icon(onPressed: _busy ? null : _unlink, icon: const Icon(Icons.link_off), label: const Text('إلغاء الربط')),
        ],
      ),
    );
  }
}
