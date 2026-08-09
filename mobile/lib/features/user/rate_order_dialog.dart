// نافذة تقييم الكابتن بعد التسليم — اختيار نجوم (1..5) وتعليق اختياري.

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
  int _stars = 5;
  final _comment = TextEditingController();
  bool _sending = false;

  Future<void> _submit() async {
    setState(() => _sending = true);
    try {
      await widget.api.post('/orders/${widget.orderId}/rate', {
        'stars': _stars,
        'comment': _comment.text,
      });
      if (mounted) Navigator.pop(context, true); // نجاح
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
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // صفّ النجوم
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(5, (i) {
              final filled = i < _stars;
              return IconButton(
                onPressed: () => setState(() => _stars = i + 1),
                icon: Icon(filled ? Icons.star : Icons.star_border, color: Colors.amber, size: 32),
              );
            }),
          ),
          TextField(
            controller: _comment,
            decoration: const InputDecoration(
              labelText: 'تعليق (اختياري)',
              border: OutlineInputBorder(),
            ),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('إلغاء')),
        FilledButton(
          onPressed: _sending ? null : _submit,
          child: _sending
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('إرسال'),
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
