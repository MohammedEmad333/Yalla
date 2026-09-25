// شاشة المحفظة (تطبيق المستخدم) — تعرض الرصيد الحالي وسجلّ الحركات،
// وتفتح شاشة شحن الرصيد. تستقبل تحديث الرصيد لحظيًا عبر السوكت.

import 'package:flutter/material.dart';

import '../../../core/network/api_client.dart';
import '../../../core/realtime/socket_service.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/ui.dart';
import '../data/wallet_repository.dart';
import 'topup_screen.dart';
import 'withdraw_screen.dart';

enum _TxTypeFilter { all, topup, withdrawal, order }
enum _TxStatusFilter { all, approved, pending, rejected }

class WalletScreen extends StatefulWidget {
  final ApiClient api;
  final SocketService socket;
  const WalletScreen({super.key, required this.api, required this.socket});

  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  late final WalletRepository _repo = WalletRepository(widget.api);
  static const int _pageSize = 20;
  final ScrollController _scrollController = ScrollController();

  num _balance = 0;
  String _currency = 'ILS';
  List<dynamic> _transactions = [];
  List<dynamic> _withdrawals = [];
  DateTime? _lastUpdated;
  _TxTypeFilter _typeFilter = _TxTypeFilter.all;
  _TxStatusFilter _statusFilter = _TxStatusFilter.all;
  bool _loading = true;
  bool _loadingMore = false;
  bool _hasMore = true;
  void Function()? _walletUnsubscribe;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_maybeLoadMore);
    _load();
    // تحديث الرصيد فور موافقة الأدمن (بثّ لحظي)
    _walletUnsubscribe = widget.socket.onWalletUpdated((data) {
      if (!mounted) return;
      if (data['balance'] != null) {
        setState(() {
          _balance = data['balance'] as num;
          _lastUpdated = DateTime.now();
        });
      }
      _loadTransactionsOnly();
    });
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait([
        _repo.getBalance(),
        _repo.getTransactions(limit: _pageSize),
        _repo.getWithdrawals(),
      ]);
      if (!mounted) return;
      final balance = results[0] as Map<String, dynamic>;
      setState(() {
        _balance = balance['balance'] as num? ?? 0;
        _currency = balance['currency'] as String? ?? 'ILS';
        _transactions = results[1] as List;
        _withdrawals = results[2] as List;
        _hasMore = _transactions.length >= _pageSize;
        _lastUpdated = DateTime.now();
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _loadTransactionsOnly() async {
    try {
      widget.api.clearGetCache(prefix: '/wallet/transactions');
      widget.api.clearGetCache(prefix: '/wallet/withdrawals');
      final results = await Future.wait([
        _repo.getTransactions(limit: _pageSize),
        _repo.getWithdrawals(),
      ]);
      if (mounted) {
        final data = results[0] as List;
        setState(() {
          _transactions = data;
          _withdrawals = results[1] as List;
          _hasMore = data.length >= _pageSize;
          _lastUpdated = DateTime.now();
        });
      }
    } catch (_) {
      // تحديث الرصيد اللحظي لا يتأثر إذا تعذر تحديث السجل مؤقتًا.
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || !_hasMore) return;
    setState(() => _loadingMore = true);
    try {
      final page = await _repo.getTransactions(
        limit: _pageSize,
        skip: _transactions.length,
      );
      if (!mounted) return;
      setState(() {
        _transactions.addAll(page);
        _hasMore = page.length >= _pageSize;
      });
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  void _maybeLoadMore() {
    if (!_scrollController.hasClients || _loadingMore || !_hasMore) return;
    final position = _scrollController.position;
    if (position.maxScrollExtent > 0 &&
        position.pixels >= position.maxScrollExtent * .75) {
      _loadMore();
    }
  }

  @override
  void dispose() {
    _walletUnsubscribe?.call();
    _scrollController.dispose();
    super.dispose();
  }

  // فتح شاشة الشحن ثم إعادة التحميل عند نجاح إرسال الطلب
  Future<void> _openTopup({Map<String, dynamic>? retry}) async {
    final amount = retry?['amount'];
    final done = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => TopupScreen(
          api: widget.api,
          initialMethod: retry?['method']?.toString(),
          initialAmount: amount is num ? amount.toInt() : null,
        ),
      ),
    );
    if (done == true) _load();
  }

  // Card 98: فتح شاشة سحب الرصيد ثم إعادة التحميل عند نجاح إرسال الطلب
  Future<void> _openWithdraw() async {
    final done = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => WithdrawScreen(api: widget.api)),
    );
    if (done == true) _load();
  }


  bool _isTopupType(String type) =>
      !const {'order_payment', 'refund', 'adjustment', 'withdrawal'}.contains(type);

  List<Map<String, dynamic>> get _visibleTransactions {
    return _transactions
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .where((tx) {
      final type = (tx['type'] ?? '').toString();
      final status = (tx['status'] ?? '').toString();
      final typeMatches = switch (_typeFilter) {
        _TxTypeFilter.all => true,
        _TxTypeFilter.topup => _isTopupType(type),
        _TxTypeFilter.withdrawal => type == 'withdrawal',
        _TxTypeFilter.order => type == 'order_payment',
      };
      final statusMatches = switch (_statusFilter) {
        _TxStatusFilter.all => true,
        _TxStatusFilter.approved => status == 'approved',
        _TxStatusFilter.pending => status == 'pending',
        _TxStatusFilter.rejected => status == 'rejected',
      };
      return typeMatches && statusMatches;
    }).toList();
  }

  List<Map<String, dynamic>> get _pendingEntries {
    final entries = <Map<String, dynamic>>[];
    for (final tx in _transactions.whereType<Map>()) {
      if ((tx['status'] ?? '').toString() == 'pending') {
        entries.add({'kind': 'transaction', ...Map<String, dynamic>.from(tx)});
      }
    }
    for (final raw in _withdrawals.whereType<Map>()) {
      final w = Map<String, dynamic>.from(raw);
      if ((w['status'] ?? '').toString() != 'pending') continue;
      final id = (w['_id'] ?? '').toString();
      final duplicate = id.isNotEmpty &&
          entries.any((e) => (e['_id'] ?? '').toString() == id);
      if (!duplicate) entries.add({'kind': 'withdrawal', ...w});
    }
    return entries;
  }

  num get _pendingAmount => _pendingEntries.fold<num>(
        0,
        (sum, e) => sum + ((e['amount'] as num?) ?? 0),
      );

  String _timeLabel(DateTime d) {
    final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
    final m = d.minute.toString().padLeft(2, '0');
    final suffix = d.hour < 12 ? 'ص' : 'م';
    return '$h:$m $suffix';
  }

  String _txDate(Map<String, dynamic> tx) {
    for (final key in const ['createdAt', 'created_at', 'updatedAt']) {
      final d = DateTime.tryParse((tx[key] ?? '').toString())?.toLocal();
      if (d != null) {
        return '${d.day}/${d.month}/${d.year} · ${_timeLabel(d)}';
      }
    }
    return '';
  }

  Widget _typeFilters() {
    const entries = [
      (_TxTypeFilter.all, 'الكل'),
      (_TxTypeFilter.topup, 'شحن'),
      (_TxTypeFilter.withdrawal, 'سحب'),
      (_TxTypeFilter.order, 'دفع طلبات'),
    ];
    return SizedBox(
      height: 42,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: entries.length,
        separatorBuilder: (_, __) => const SizedBox(width: 7),
        itemBuilder: (_, i) {
          final entry = entries[i];
          return ChoiceChip(
            selected: _typeFilter == entry.$1,
            label: Text(entry.$2),
            onSelected: (_) => setState(() => _typeFilter = entry.$1),
          );
        },
      ),
    );
  }

  Widget _statusFilters() {
    const entries = [
      (_TxStatusFilter.all, 'كل الحالات'),
      (_TxStatusFilter.approved, 'مقبولة'),
      (_TxStatusFilter.pending, 'قيد المراجعة'),
      (_TxStatusFilter.rejected, 'مرفوضة'),
    ];
    return SizedBox(
      height: 38,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: entries.length,
        separatorBuilder: (_, __) => const SizedBox(width: 7),
        itemBuilder: (_, i) {
          final entry = entries[i];
          return FilterChip(
            selected: _statusFilter == entry.$1,
            label: Text(entry.$2),
            onSelected: (_) => setState(() => _statusFilter = entry.$1),
          );
        },
      ),
    );
  }

  Widget _pendingBanner() {
    final first = _pendingEntries.first;
    final amount = (first['amount'] as num?) ?? 0;
    final type = (first['type'] ?? '').toString();
    final label = first['kind'] == 'withdrawal' || type == 'withdrawal'
        ? 'طلب سحب'
        : 'طلب شحن';
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: YallaColors.statusInTransit.withValues(alpha: .08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: YallaColors.statusInTransit.withValues(alpha: .25),
        ),
      ),
      child: Row(
        children: [
          Icon(Icons.schedule_rounded, color: YallaColors.statusInTransit),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              _pendingEntries.length == 1
                  ? 'لديك $label بقيمة $amount ₪ قيد المراجعة'
                  : 'لديك ${_pendingEntries.length} طلبات مالية قيد المراجعة',
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
          if (_pendingEntries.length > 1)
            Text(
              '$_pendingAmount ₪',
              style: TextStyle(
                color: YallaColors.statusInTransit,
                fontWeight: FontWeight.w900,
              ),
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final visible = _visibleTransactions;
    return Scaffold(
      appBar: AppBar(toolbarHeight: 0),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          controller: _scrollController,
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
          children: [
            _balanceCard(),
            if (_pendingEntries.isNotEmpty) ...[
              const SizedBox(height: 14),
              _pendingBanner(),
            ],
            const SizedBox(height: 20),
            Row(
              children: [
                Text(
                  'سجل العمليات',
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.w900),
                ),
                const Spacer(),
                if (_lastUpdated != null)
                  Text(
                    'آخر تحديث ${_timeLabel(_lastUpdated!)}',
                    style: TextStyle(color: YallaColors.muted, fontSize: 11),
                  ),
              ],
            ),
            const SizedBox(height: 10),
            _typeFilters(),
            const SizedBox(height: 8),
            _statusFilters(),
            const SizedBox(height: 10),
            if (_loading)
              const Padding(
                padding: EdgeInsets.all(24),
                child: LoadingView(),
              )
            else if (visible.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: EmptyStateView(
                  icon: Icons.filter_alt_off_outlined,
                  title: 'لا توجد عمليات مطابقة',
                  message: 'غيّر الفلاتر أو اسحب للتحديث.',
                ),
              )
            else
              ...visible.map(_txTile),
            if (_loadingMore)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 14),
                child: Center(child: CircularProgressIndicator()),
              ),
          ],
        ),
      ),
    );
  }

  Widget _balanceCard() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [YallaColors.primary, YallaColors.primaryDeep],
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
        ),
        borderRadius: BorderRadius.circular(YallaRadii.xl),
        boxShadow: [
          BoxShadow(
            color: YallaColors.primary.withValues(alpha: .25),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'الرصيد المتاح',
            style: TextStyle(color: Colors.white70, fontSize: 14),
          ),
          const SizedBox(height: 6),
          Text(
            '$_balance ₪',
            textDirection: TextDirection.ltr,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 38,
              fontWeight: FontWeight.w900,
            ),
          ),
          Text(
            _currency,
            style: const TextStyle(color: Colors.white60, fontSize: 12),
          ),
          if (_pendingEntries.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              'طلبات معلقة: ${_pendingEntries.length} · $_pendingAmount ₪',
              style: const TextStyle(
                color: Colors.white70,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: YallaColors.primaryDeep,
                  ),
                  onPressed: _openTopup,
                  icon: const Icon(Icons.add_rounded),
                  label: const Text('شحن'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: const BorderSide(color: Colors.white70),
                  ),
                  onPressed: _openWithdraw,
                  icon: const Icon(Icons.account_balance_outlined),
                  label: const Text('سحب'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // صف عملية مضغوط مع التاريخ والحالة وإعادة محاولة للشحن المرفوض.
  Widget _txTile(dynamic raw) {
    final tx = Map<String, dynamic>.from(raw as Map);
    final amount = (tx['amount'] as num?) ?? 0;
    final status = (tx['status'] ?? 'pending').toString();
    final type = (tx['type'] ?? '').toString();
    final method = tx['method']?.toString();
    final desc = _txDescription(type, method);
    final (label, color, tone) = _statusMeta(status);
    final isCredit = (tx['direction'] as String?) == 'credit';
    final reason = (tx['rejectionReason'] ?? '').toString().trim();
    final showReason = status == 'rejected' && reason.isNotEmpty;
    final retryable = status == 'rejected' && _isTopupType(type);

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: YallaColors.outline),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 20,
            backgroundColor: color.withValues(alpha: .11),
            child: Icon(
              isCredit ? Icons.south_west_rounded : Icons.north_east_rounded,
              color: color,
              size: 20,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        desc,
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                    ),
                    Text(
                      '${isCredit ? '+' : '-'}$amount ₪',
                      textDirection: TextDirection.ltr,
                      style: TextStyle(
                        color: isCredit ? YallaColors.success : null,
                        fontSize: 16,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 3),
                if (_txDate(tx).isNotEmpty)
                  Text(
                    _txDate(tx),
                    style: TextStyle(color: YallaColors.muted, fontSize: 11),
                  ),
                if (showReason) ...[
                  const SizedBox(height: 5),
                  Text(
                    'سبب الرفض: $reason',
                    style: TextStyle(
                      color: YallaColors.error,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
                if (retryable) ...[
                  const SizedBox(height: 2),
                  TextButton.icon(
                    onPressed: () => _openTopup(retry: tx),
                    style: TextButton.styleFrom(
                      padding: EdgeInsets.zero,
                      visualDensity: VisualDensity.compact,
                    ),
                    icon: const Icon(Icons.refresh_rounded, size: 17),
                    label: const Text('إعادة المحاولة'),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          StatusPill(label, tone: tone),
        ],
      ),
    );
  }

  // وصف الحركة حسب نوعها (Card 28): خصم قيمة طلب لا يُعرض كـ«شحن رصيد».
  String _txDescription(String? type, String? method) => switch (type) {
        'order_payment' => 'دفع قيمة طلب',
        'refund' => 'استرداد رصيد',
        'adjustment' => 'تعديل رصيد',
        'withdrawal' => 'سحب رصيد',
        // شحن رصيد: نعرض طريقة الدفع إن توفّرت
        _ => _methodLabel(method),
      };

  String _methodLabel(String? m) => switch (m) {
        'bank_of_palestine' => 'شحن رصيد · بنك فلسطين',
        'jawwal_pay' => 'شحن رصيد · جوال باي',
        'palpay' => 'شحن رصيد · بال باي',
        _ => 'شحن رصيد',
      };

  (String, Color, PillTone) _statusMeta(String s) => switch (s) {
        'pending' => ('قيد المراجعة', YallaColors.statusInTransit, PillTone.warning),
        'approved' => ('مقبولة', YallaColors.success, PillTone.success),
        'rejected' => ('مرفوضة', YallaColors.error, PillTone.danger),
        _ => (s, YallaColors.muted, PillTone.neutral),
      };
}
