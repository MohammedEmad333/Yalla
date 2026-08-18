// شاشة التواصل المباشر مع الإدارة (Card 44 + Card 46).
// يراسل الزبون الإدارة ويستقبل الردود لحظيًا، مع زرّ واتس اب للتواصل السريع (Card 43).

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/config/company.dart';
import '../../core/network/api_client.dart';
import '../../core/realtime/socket_service.dart';
import '../../core/theme/app_theme.dart';

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

  @override
  void initState() {
    super.initState();
    _load();
    // استقبال ردّ الإدارة لحظيًا
    widget.socket.onSupportMessage((m) {
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
      // تجنّب التكرار إن سبق أن وصل عبر السوكت
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
        _scroll.animateTo(_scroll.position.maxScrollExtent,
            duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      }
    });
  }

  void _snack(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('التواصل مع الإدارة'),
        actions: [
          // زرّ واتس اب الشركة (Card 43)
          IconButton(
            tooltip: 'واتس اب',
            icon: const Icon(Icons.chat, color: Color(0xFF25D366)),
            onPressed: _openWhatsapp,
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _messages.isEmpty
                    ? _emptyState()
                    : ListView.builder(
                        controller: _scroll,
                        padding: const EdgeInsets.all(16),
                        itemCount: _messages.length,
                        itemBuilder: (_, i) => _bubble(_messages[i]),
                      ),
          ),
          _composer(),
        ],
      ),
    );
  }

  Widget _emptyState() => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.support_agent, size: 64, color: YallaColors.muted),
              const SizedBox(height: 12),
              const Text('اكتب لنا وسنردّ عليك في أقرب وقت',
                  style: TextStyle(color: YallaColors.muted), textAlign: TextAlign.center),
              const SizedBox(height: 16),
              OutlinedButton.icon(
                onPressed: _openWhatsapp,
                icon: const Icon(Icons.chat, color: Color(0xFF25D366)),
                label: const Text('تواصل عبر واتس اب'),
              ),
            ],
          ),
        ),
      );

  Widget _bubble(Map<String, dynamic> m) {
    final mine = m['senderRole'] == 'user';
    return Align(
      alignment: mine ? Alignment.centerLeft : Alignment.centerRight,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
        decoration: BoxDecoration(
          color: mine ? YallaColors.primary : YallaColors.surfaceContainer,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${m['text'] ?? ''}',
                style: TextStyle(color: mine ? Colors.white : YallaColors.onSurface)),
            const SizedBox(height: 2),
            Text(mine ? 'أنت' : '🛡️ الإدارة',
                style: TextStyle(
                    fontSize: 10, color: mine ? Colors.white70 : YallaColors.muted)),
          ],
        ),
      ),
    );
  }

  Widget _composer() => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _controller,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _send(),
                  decoration: const InputDecoration(
                    hintText: 'اكتب رسالتك…',
                    border: OutlineInputBorder(),
                    contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                onPressed: _sending ? null : _send,
                icon: const Icon(Icons.send),
              ),
            ],
          ),
        ),
      );

  @override
  void dispose() {
    _controller.dispose();
    _scroll.dispose();
    super.dispose();
  }
}
