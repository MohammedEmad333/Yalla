import 'package:flutter/material.dart';

import '../core/session.dart';
import 'branches_screen.dart';
import 'dashboard_screen.dart';
import 'menu_screen.dart';
import 'notifications_screen.dart';
import 'operations_settings_screen.dart';
import 'options_screen.dart';
import 'orders_screen.dart';
import 'store_screen.dart';

class HomeScreen extends StatefulWidget {
  final PartnerSession session;
  const HomeScreen({super.key, required this.session});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _index = 0;
  int _branchRevision = 0;

  static const _labels = ['الرئيسية', 'الطلبات', 'المنتجات', 'الإضافات', 'المتجر'];
  static const _icons = [
    Icons.dashboard_outlined,
    Icons.receipt_long_outlined,
    Icons.inventory_2_outlined,
    Icons.tune_outlined,
    Icons.store_outlined,
  ];
  static const _selectedIcons = [
    Icons.dashboard_rounded,
    Icons.receipt_long_rounded,
    Icons.inventory_2_rounded,
    Icons.tune_rounded,
    Icons.store_rounded,
  ];

  Future<void> _openBranches() async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => BranchesScreen(session: widget.session)),
    );
    if (changed == true && mounted) {
      setState(() {
        _branchRevision += 1;
        _index = 0;
      });
    }
  }

  List<Widget> _pages() => [
        PartnerDashboardScreen(
          key: ValueKey('dashboard-$_branchRevision'),
          api: widget.session.api,
        ),
        OrdersScreen(
          key: ValueKey('orders-$_branchRevision'),
          api: widget.session.api,
        ),
        MenuScreen(
          key: ValueKey('menu-$_branchRevision'),
          api: widget.session.api,
        ),
        OptionsScreen(
          key: ValueKey('options-$_branchRevision'),
          api: widget.session.api,
        ),
        StoreScreen(
          key: ValueKey('store-$_branchRevision'),
          api: widget.session.api,
          onLogout: widget.session.logout,
        ),
      ];

  Map<String, dynamic> get _merchant =>
      widget.session.merchant.value ?? <String, dynamic>{};

  Map get _restaurant =>
      _merchant['restaurant'] is Map ? _merchant['restaurant'] as Map : {};

  bool get _isOwner =>
      (_merchant['staffRole']?.toString() ?? 'owner') == 'owner';

  String get _storeName {
    final restaurantName = _restaurant['name']?.toString().trim() ?? '';
    if (restaurantName.isNotEmpty) return restaurantName;
    return _merchant['name']?.toString() ?? 'متجرك';
  }

  Widget _brand({bool compact = false}) {
    return Row(
      children: [
        Container(
          width: compact ? 42 : 48,
          height: compact ? 42 : 48,
          decoration: BoxDecoration(
            color: const Color(0xFF071D3A),
            borderRadius: BorderRadius.circular(compact ? 13 : 15),
          ),
          child: Icon(
            Icons.storefront_rounded,
            color: const Color(0xFFFF7A00),
            size: compact ? 24 : 27,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Yalla Partner',
                style: TextStyle(
                  fontSize: compact ? 17 : 19,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 1),
              Text(
                _storeName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF7A8595),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _actionButtons() {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (_isOwner)
          IconButton(
            tooltip: 'الفروع',
            onPressed: _openBranches,
            icon: const Icon(Icons.account_tree_outlined),
          ),
        IconButton(
          tooltip: 'تشغيل المتجر',
          onPressed: () => Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) =>
                  OperationsSettingsScreen(api: widget.session.api),
            ),
          ),
          icon: const Icon(Icons.settings_suggest_outlined),
        ),
        const SizedBox(width: 4),
        IconButton(
          tooltip: 'الإشعارات',
          onPressed: () => Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) =>
                  PartnerNotificationsScreen(api: widget.session.api),
            ),
          ),
          style: IconButton.styleFrom(
            backgroundColor: Colors.white,
            foregroundColor: const Color(0xFF071D3A),
            side: const BorderSide(color: Color(0xFFDDE2EA)),
          ),
          icon: const Icon(Icons.notifications_none_rounded),
        ),
      ],
    );
  }

  Widget _desktopSidebar() {
    return Container(
      width: 252,
      color: Colors.white,
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 20, 18, 18),
          child: Column(
            children: [
              _brand(),
              const SizedBox(height: 28),
              Expanded(
                child: ListView.separated(
                  itemCount: _labels.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final selected = _index == index;
                    return Material(
                      color: selected
                          ? const Color(0xFFFFF1E4)
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(16),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(16),
                        onTap: () => setState(() => _index = index),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 13,
                          ),
                          child: Row(
                            children: [
                              Icon(
                                selected
                                    ? _selectedIcons[index]
                                    : _icons[index],
                                color: selected
                                    ? const Color(0xFFFF7A00)
                                    : const Color(0xFF657287),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Text(
                                  _labels[index],
                                  style: TextStyle(
                                    fontWeight: selected
                                        ? FontWeight.w900
                                        : FontWeight.w700,
                                    color: selected
                                        ? const Color(0xFF071D3A)
                                        : const Color(0xFF657287),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
              const Divider(height: 24),
              OutlinedButton.icon(
                onPressed: widget.session.logout,
                icon: const Icon(Icons.logout_rounded),
                label: const Text('تسجيل الخروج'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _desktopLayout(List<Widget> pages) {
    return Row(
      children: [
        _desktopSidebar(),
        const VerticalDivider(width: 1, thickness: 1, color: Color(0xFFE8EBF0)),
        Expanded(
          child: Column(
            children: [
              Container(
                height: 82,
                padding: const EdgeInsets.symmetric(horizontal: 24),
                decoration: const BoxDecoration(
                  color: Color(0xFFF8F9FC),
                  border: Border(
                    bottom: BorderSide(color: Color(0xFFE8EBF0)),
                  ),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        _labels[_index],
                        style: const TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    _actionButtons(),
                  ],
                ),
              ),
              Expanded(
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 1360),
                    child: IndexedStack(index: _index, children: pages),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _mobileLayout(List<Widget> pages) {
    return Scaffold(
      appBar: AppBar(
        toolbarHeight: 82,
        titleSpacing: 16,
        title: _brand(compact: true),
        actions: [
          if (_isOwner)
            IconButton(
              tooltip: 'الفروع',
              onPressed: _openBranches,
              icon: const Icon(Icons.account_tree_outlined),
            ),
          IconButton(
            tooltip: 'تشغيل المتجر',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) =>
                    OperationsSettingsScreen(api: widget.session.api),
              ),
            ),
            icon: const Icon(Icons.settings_suggest_outlined),
          ),
          Padding(
            padding: const EdgeInsetsDirectional.only(end: 12),
            child: IconButton(
              tooltip: 'الإشعارات',
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) =>
                      PartnerNotificationsScreen(api: widget.session.api),
                ),
              ),
              style: IconButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: const Color(0xFF071D3A),
                side: const BorderSide(color: Color(0xFFDDE2EA)),
              ),
              icon: const Icon(Icons.notifications_none_rounded),
            ),
          ),
        ],
      ),
      body: IndexedStack(index: _index, children: pages),
      bottomNavigationBar: SafeArea(
        top: false,
        child: Container(
          decoration: const BoxDecoration(
            boxShadow: [
              BoxShadow(
                color: Color(0x12071D3A),
                blurRadius: 18,
                offset: Offset(0, -4),
              ),
            ],
          ),
          child: NavigationBar(
            selectedIndex: _index,
            onDestinationSelected: (value) => setState(() => _index = value),
            destinations: List.generate(
              _labels.length,
              (index) => NavigationDestination(
                icon: Icon(_icons[index]),
                selectedIcon: Icon(_selectedIcons[index]),
                label: _labels[index],
              ),
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pages = _pages();

    return LayoutBuilder(
      builder: (context, constraints) {
        final desktop = constraints.maxWidth >= 980;
        if (desktop) {
          return Scaffold(body: _desktopLayout(pages));
        }
        return _mobileLayout(pages);
      },
    );
  }
}
