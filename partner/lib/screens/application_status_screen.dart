import 'package:flutter/material.dart';

import '../core/session.dart';

class ApplicationStatusScreen extends StatefulWidget {
  final PartnerSession session;
  final Map<String, dynamic> merchant;
  const ApplicationStatusScreen({super.key, required this.session, required this.merchant});

  @override
  State<ApplicationStatusScreen> createState() => _ApplicationStatusScreenState();
}

class _ApplicationStatusScreenState extends State<ApplicationStatusScreen> {
  bool _busy = false;

  Future<void> _refresh() async {
    setState(() => _busy = true);
    try {
      await widget.session.refreshApplicationStatus();
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = widget.merchant['applicationStatus']?.toString() ?? 'pending';
    final rejected = status == 'rejected';
    final restaurant = widget.merchant['restaurant'] is Map
        ? Map<String, dynamic>.from(widget.merchant['restaurant'] as Map)
        : <String, dynamic>{};
    final reason = widget.merchant['applicationRejectionReason']?.toString().trim() ?? '';
    final storeName = restaurant['name']?.toString() ?? (rejected ? 'المتجر' : 'متجرك');

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(22),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      CircleAvatar(
                        radius: 34,
                        backgroundColor: rejected ? const Color(0xFFFFE8E8) : const Color(0xFFFFE8D3),
                        child: Icon(
                          rejected ? Icons.cancel_outlined : Icons.hourglass_top_rounded,
                          size: 34,
                          color: rejected ? const Color(0xFFC23A3A) : const Color(0xFFFF7A00),
                        ),
                      ),
                      const SizedBox(height: 20),
                      Text(
                        rejected ? 'طلب المتجر يحتاج تعديل' : 'متجرك قيد المراجعة',
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        rejected
                            ? 'تمت مراجعة طلب انضمام ' + storeName + ' ولم يتم اعتماده حاليًا.'
                            : 'استلمنا طلب انضمام ' + storeName + '. سيبقى مخفيًا عن الزبائن حتى تعتمد الإدارة البيانات.',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Color(0xFF657287), height: 1.6),
                      ),
                      if (rejected && reason.isNotEmpty) ...[
                        const SizedBox(height: 18),
                        Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(color: const Color(0xFFFFF1F1), borderRadius: BorderRadius.circular(16)),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('سبب الرفض', style: TextStyle(fontWeight: FontWeight.w900, color: Color(0xFFC23A3A))),
                              const SizedBox(height: 6),
                              Text(reason, style: const TextStyle(height: 1.5)),
                            ],
                          ),
                        ),
                      ],
                      const SizedBox(height: 24),
                      FilledButton.icon(
                        onPressed: _busy ? null : _refresh,
                        icon: _busy
                            ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                            : const Icon(Icons.refresh_rounded),
                        label: const Text('تحديث حالة الطلب'),
                      ),
                      const SizedBox(height: 10),
                      OutlinedButton.icon(
                        onPressed: widget.session.logout,
                        icon: const Icon(Icons.logout_rounded),
                        label: const Text('تسجيل الخروج'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
