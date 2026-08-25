// شاشة دردشة الطلب بين صاحب الطلب والكابتن (Card 18).
// تُتاح خلال فترة التوصيل فقط، وتُحذف رسائلها فور تسليم الطلب أو إلغائه.
// تحمّل السجلّ عبر REST ثم تستقبل الرسائل الجديدة لحظيًا عبر السوكت.

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/network/api_client.dart';
import '../../core/realtime/socket_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/util/names.dart';

class ChatScreen extends StatefulWidget {
  final String orderId;
  final ApiClient api;
  final SocketService socket;
  // دور المستخدم الحالي ('user' أو 'captain') لتمييز فقاعات رسائلي
  final String myRole;

  // Card 51: اسم الطرف الآخر (الكامل — نعرض الاسم الأول فقط) ورقم هاتفه للاتصال المباشر.
  final String? peerName;
  final String? peerPhone;
  // دور الطرف الآخر ('user' أو 'captain') — لعرض تسمية/أيقونة بديلة عند غياب الاسم.
  final String? peerRole;

  const ChatScreen({
    super.key,
    required this.orderId,
    required this.api,
    required this.socket,
    required this.myRole,
    this.peerName,
    this.peerPhone,
    this.peerRole,
  });

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  final List<Map<String, dynamic>> _messages = [];
  bool _loading = true;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    widget.socket.joinOrder(widget.orderId); // ننضمّ لغرفة الطلب لاستقبال الرسائل
    _load();

    // استقبال رسالة جديدة لحظيًا (لهذا الطلب فقط) مع منع التكرار بالمعرّف
    widget.socket.onChatMessage((msg) {
      if (!mounted) return;
      if ('${msg['order']}' != widget.orderId) return;
      _appendUnique(msg);
    });

    // حُذفت رسائل الطلب (انتهى التوصيل) — نُفرّغ الشاشة ونُعلم المستخدم
    widget.socket.onChatCleared((data) {
      if (!mounted) return;
      if ('${data['orderId']}' != widget.orderId) return;
      setState(() => _messages.clear());
      _snack('انتهى التوصيل — حُذفت المحادثة');
    });

    // Card 94: حذف الأدمن لرسالة واحدة — نُزيلها فورًا من الشاشة
    widget.socket.onChatMessageDeleted((data) {
      if (!mounted) return;
      if ('${data['orderId']}' != widget.orderId) return;
      setState(() => _messages.removeWhere((m) => '${m['_id']}' == '${data['id']}'));
    });
  }

  Future<void> _load() async {
    try {
      final data = await widget.api.get('/orders/${widget.orderId}/messages');
      if (!mounted) return;
      setState(() {
        _messages
          ..clear()
          ..addAll((data as List).cast<Map<String, dynamic>>());
        _loading = false;
      });
      _scrollToBottom();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      _snack(e.message);
    }
  }

  // إضافة رسالة إن لم تكن موجودة (تفادي تكرار رسالتي العائدة عبر البثّ)
  void _appendUnique(Map<String, dynamic> msg) {
    final id = msg['_id'];
    if (id != null && _messages.any((m) => m['_id'] == id)) return;
    setState(() => _messages.add(msg));
    _scrollToBottom();
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      // نرسل عبر REST (مصدر موثوق) — والخادم يبثّها لغرفة الطلب فتُضاف عبر onChatMessage
      final msg = await widget.api.post('/orders/${widget.orderId}/messages', {'text': text});
      _input.clear();
      if (msg is Map) _appendUnique(Map<String, dynamic>.from(msg));
    } on ApiException catch (e) {
      _snack(e.message); // مثل: "الدردشة متاحة خلال فترة التوصيل فقط"
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _snack(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  // Card 51: اتصال هاتفي مباشر بالطرف الآخر عبر تطبيق الهاتف (رصيد الهاتف، لا داخل التطبيق).
  Future<void> _callPeer() async {
    final phone = (widget.peerPhone ?? '').trim();
    if (phone.isEmpty) {
      _snack('رقم الهاتف غير متاح');
      return;
    }
    final uri = Uri(scheme: 'tel', path: phone);
    if (!await launchUrl(uri)) _snack('تعذّر بدء الاتصال');
  }

  // أيقونة تمثّل دور المُرسِل (Card 93): صاحب الطلب / الكابتن / الأدمن
  IconData _roleIcon(String? role) => switch (role) {
        'captain' => Icons.two_wheeler,
        'admin' => Icons.shield,
        _ => Icons.person,
      };

  // تسمية عربية لدور طرف المحادثة (تُستخدم بديلًا عن الاسم عند غيابه)
  String _roleLabel(String? role) => switch (role) {
        'captain' => 'الكابتن',
        'admin' => 'الإدارة',
        _ => 'صاحب الطلب',
      };

  // اسم المُرسِل المعروض على كل رسالة (Card 93): "أنت" لرسائلي، والإدارة للأدمن،
  // واسم الطرف الآخر (الأول فقط) وإلا تسمية دوره.
  String _senderName(String? role) {
    if (role == widget.myRole) return 'أنت';
    if (role == 'admin') return 'الإدارة';
    final peerFirst = firstName(widget.peerName);
    if (peerFirst.isNotEmpty && role == widget.peerRole) return peerFirst;
    return _roleLabel(role);
  }

  @override
  Widget build(BuildContext context) {
    // Card 51: نعرض الاسم الأول فقط للطرف الآخر (خصوصية) وإلا تسمية دوره.
    final peerFirst = firstName(widget.peerName);
    final peerLabel = peerFirst.isNotEmpty ? peerFirst : _roleLabel(widget.peerRole);
    final title = 'الدردشة مع $peerLabel';
    final canCall = (widget.peerPhone ?? '').trim().isNotEmpty;
    return Scaffold(
      appBar: AppBar(
        // Card 93: أيقونة الطرف الآخر بجانب اسمه في أعلى الدردشة
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircleAvatar(
              radius: 14,
              backgroundColor: YallaColors.primary,
              child: Icon(_roleIcon(widget.peerRole), size: 16, color: Colors.white),
            ),
            const SizedBox(width: 8),
            Flexible(child: Text(title, overflow: TextOverflow.ellipsis)),
          ],
        ),
        actions: [
          if (canCall)
            IconButton(
              tooltip: 'اتصال هاتفي',
              icon: const Icon(Icons.call),
              onPressed: _callPeer,
            ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _messages.isEmpty
                    ? const Center(
                        child: Text('ابدأ المحادثة أثناء التوصيل',
                            style: TextStyle(color: YallaColors.muted)),
                      )
                    : ListView.builder(
                        controller: _scroll,
                        padding: const EdgeInsets.all(12),
                        itemCount: _messages.length,
                        itemBuilder: (_, i) => _bubble(_messages[i]),
                      ),
          ),
          _composer(),
        ],
      ),
    );
  }

  Widget _bubble(Map<String, dynamic> msg) {
    final role = msg['senderRole'] as String?;
    final mine = role == widget.myRole;
    // Card 93: أيقونة واسم المُرسِل فوق نصّ كل رسالة
    final name = _senderName(role);
    final onColor = mine ? Colors.white : null;
    final labelColor = mine ? Colors.white70 : YallaColors.muted;
    return Align(
      alignment: mine ? Alignment.centerLeft : Alignment.centerRight,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.72),
        decoration: BoxDecoration(
          color: mine ? YallaColors.primary : Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(_roleIcon(role), size: 13, color: labelColor),
                const SizedBox(width: 4),
                Text(name, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: labelColor)),
              ],
            ),
            const SizedBox(height: 3),
            Text('${msg['text'] ?? ''}', style: TextStyle(color: onColor)),
          ],
        ),
      ),
    );
  }

  Widget _composer() {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: _input,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _send(),
                decoration: const InputDecoration(
                  hintText: 'اكتب رسالة…',
                  border: OutlineInputBorder(),
                  contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                ),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filled(
              onPressed: _sending ? null : _send,
              icon: _sending
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.send),
            ),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }
}
