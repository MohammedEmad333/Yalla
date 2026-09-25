// نافذة تقييم الكابتن بعد التسليم — نجوم + ملاحظات سريعة + تعليق اختياري.

import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';

class RateOrderDialog extends StatefulWidget {
  final ApiClient api;
  final String orderId;
  const RateOrderDialog({super.key, required this.api, required this.orderId});

  @override
  State<RateOrderDialog> createState() => _RateOrderDialogState();
}

class _RateOrderDialogState extends State<RateOrderDialog> {
  int _stars = 0;
  final _comment = TextEditingController();
  final Set<String> _tags = {};
  bool _sending = false;

  static const _quickTags = ['سريع', 'محترم', 'التوصيل ممتاز', 'التواصل جيد', 'تأخر'];

  Future<void> _submit() async {
    if (_stars == 0) return;
    setState(() => _sending = true);
    final typed = _comment.text.trim();
    final parts = <String>[..._tags, if (typed.isNotEmpty) typed];
    try {
      await widget.api.post('/orders/${widget.orderId}/rate', {
        'stars': _stars,
        'comment': parts.join(' · '),
      });
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
        setState(() => _sending = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('قيّم الكابتن'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_stars == 0 ? 'اختر تقييمك' : '$_stars من 5'),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(5, (i) {
                final filled = i < _stars;
                return IconButton(
                  tooltip: '${i + 1} نجوم',
                  onPressed: () => setState(() => _stars = i + 1),
                  icon: Icon(
                    filled ? Icons.star_rounded : Icons.star_border_rounded,
                    color: Colors.amber,
                    size: 34,
                  ),
                );
              }),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 7,
              runSpacing: 7,
              alignment: WrapAlignment.center,
              children: _quickTags.map((tag) => FilterChip(
                label: Text(tag),
                selected: _tags.contains(tag),
                onSelected: (selected) => setState(() {
                  selected ? _tags.add(tag) : _tags.remove(tag);
                }),
              )).toList(),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _comment,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(
                hintText: 'تعليق إضافي (اختياري)',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _sending ? null : () => Navigator.pop(context, false),
          child: const Text('إلغاء'),
        ),
        FilledButton(
          onPressed: _sending || _stars == 0 ? null : _submit,
          child: _sending
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('إرسال التقييم'),
        ),
      ],
    );
  }

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }
}
