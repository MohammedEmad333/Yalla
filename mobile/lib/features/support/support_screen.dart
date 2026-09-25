// شاشة التواصل المباشر مع الإدارة — محادثة + مواضيع سريعة + واتس اب.

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/config/company.dart';
import '../../core/network/api_client.dart';
import '../../core/realtime/socket_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/ui.dart';

class SupportScreen extends StatefulWidget {
  final ApiClient api;
  final SocketService socket;
  const SupportScreen({super.key, required this.api, required this.socket});

  @override
  State<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends State<SupportScreen> {
  final _controller = TextEditingController();
  final _scroll = ScrollController();
  List<Map<String, dynamic>> _messages = [];
  bool _loading = true;
  bool _sending = false;
  void Function()? _supportUnsubscribe;

  static const _topics = [
    'مشكلة في طلب',
    'مشكلة في المحفظة',
    'استفسار عن الحساب',
    'اقتراح أو ملاحظة',
  ];

  @override
  void initState() {
    super.initState();
    _load();
    _supportUnsubscribe = widget.socket.onSupportMessage((m) {
      if (!mounted) return;
      setState(() => _messages.add(Map<String, dynamic>.from(m)));
      _scrollToBottom();
    });
  }

  Future<void> _load() async {
    try {
      final data = await widget.api.get('/support/messages');
      if (!mounted) return;
      setState(() {
        _messages = (data as List).cast<Map<String, dynamic>>();
        _loading = false;
      });
      _scrollToBottom();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      _snack(e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    _controller.clear();
    try {
      final msg = await widget.api.post('/support/messages', {'text': text});
      if (!mounted) return;
      final id = msg['_id'];
      final exists = _messages.any((m) => m['_id'] == id);
      if (!exists) setState(() => _messages.add(Map<String, dynamic>.from(msg)));
      _scrollToBottom();
    } on ApiException catch (e) {
      _snack(e.message);
      _controller.text = text;
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _openWhatsapp() async {
    final uri = Company.whatsappUri();
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      _snack('تعذّر فتح واتس اب');
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _snack(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  String _time(dynamic raw) {
    final d = DateTime.tryParse((raw ?? '').toString())?.toLocal();
    if (d == null) return '';
    final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
    final m = d.minute.toString().padLeft(2, '0');
    return '$h:$m ${d.hour < 12 ? 'ص' : 'م'}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('التواصل مع الإدارة'),
        actions: [
          IconButton(
            tooltip: 'واتس اب',
            icon: const Icon(Icons.chat_rounded, color: Color(0xFF25D366)),
            onPressed: _openWhatsapp,
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: _loading
                ? const LoadingView()
                : _messages.isEmpty
                    ? _emptyState()
                    : ListView.builder(
                        controller: _scroll,
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 18),
                        itemCount: _messages.length,
                        itemBuilder: (_, i) => _bubble(_messages[i]),
                      ),
          ),
          _composer(),
        ],
      ),
    );
  }

  Widget _emptyState() => ListView(
        padding: const EdgeInsets.fromLTRB(24, 72, 24, 24),
        children: [
          Center(
            child: Container(
              width: 84,
              height: 84,
              decoration: BoxDecoration(
                color: YallaColors.primary.withValues(alpha: .10),
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.support_agent_rounded,
                size: 42,
                color: YallaColors.primary,
              ),
            ),
          ),
          const SizedBox(height: 18),
          const Text(
            'كيف نقدر نساعدك؟',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 6),
          Text(
            'اختر موضوعًا سريعًا أو اكتب رسالتك مباشرة، وسنرد عليك من نفس المحادثة.',
            textAlign: TextAlign.center,
            style: TextStyle(color: YallaColors.muted, height: 1.5),
          ),
          const SizedBox(height: 18),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            alignment: WrapAlignment.center,
            children: _topics
                .map(
                  (topic) => ActionChip(
                    avatar: const Icon(Icons.add_comment_outlined, size: 17),
                    label: Text(topic),
                    onPressed: () {
                      _controller.text = '$topic: ';
                      _controller.selection = TextSelection.collapsed(
                        offset: _controller.text.length,
                      );
                    },
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 18),
          OutlinedButton.icon(
            onPressed: _openWhatsapp,
            icon: const Icon(Icons.chat_rounded, color: Color(0xFF25D366)),
            label: const Text('التواصل عبر واتس اب'),
          ),
        ],
      );

  Widget _bubble(Map<String, dynamic> m) {
    final mine = m['senderRole'] == 'user';
    final time = _time(m['createdAt']);
    return Align(
      alignment: mine ? Alignment.centerLeft : Alignment.centerRight,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * .78,
        ),
        decoration: BoxDecoration(
          color: mine ? YallaColors.primary : YallaColors.card,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(mine ? 5 : 16),
            bottomRight: Radius.circular(mine ? 16 : 5),
          ),
          border: mine ? null : Border.all(color: YallaColors.outline),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${m['text'] ?? ''}',
              style: TextStyle(
                color: mine ? YallaColors.onPrimary : YallaColors.onSurface,
                height: 1.45,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              mine
                  ? (time.isEmpty ? 'أنت' : 'أنت · $time')
                  : (time.isEmpty ? 'الإدارة' : 'الإدارة · $time'),
              style: TextStyle(
                fontSize: 10,
                color: mine
                    ? YallaColors.onPrimary.withValues(alpha: .72)
                    : YallaColors.muted,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _composer() => SafeArea(
        top: false,
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 9, 12, 10),
          decoration: BoxDecoration(
            color: YallaColors.surface,
            border: Border(top: BorderSide(color: YallaColors.outline)),
          ),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _controller,
                  minLines: 1,
                  maxLines: 4,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _send(),
                  decoration: const InputDecoration(
                    hintText: 'اكتب رسالتك…',
                    prefixIcon: Icon(Icons.chat_bubble_outline_rounded),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              SizedBox(
                width: 50,
                height: 50,
                child: IconButton.filled(
                  onPressed: _sending ? null : _send,
                  icon: _sending
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.send_rounded),
                ),
              ),
            ],
          ),
        ),
      );

  @override
  void dispose() {
    _supportUnsubscribe?.call();
    _controller.dispose();
    _scroll.dispose();
    super.dispose();
  }
}
