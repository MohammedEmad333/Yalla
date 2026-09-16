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

  @override
  Widget build(BuildContext context) {
    final pages = [
      PartnerDashboardScreen(key: ValueKey('dashboard-$_branchRevision'), api: widget.session.api),
      OrdersScreen(key: ValueKey('orders-$_branchRevision'), api: widget.session.api),
      MenuScreen(key: ValueKey('menu-$_branchRevision'), api: widget.session.api),
      OptionsScreen(key: ValueKey('options-$_branchRevision'), api: widget.session.api),
      StoreScreen(key: ValueKey('store-$_branchRevision'), api: widget.session.api, onLogout: widget.session.logout),
    ];
    final merchant = widget.session.merchant.value ?? {};
    final restaurant = merchant['restaurant'] is Map ? merchant['restaurant'] as Map : {};
    final storeName = restaurant['name']?.toString().trim().isNotEmpty == true
        ? restaurant['name'].toString()
        : merchant['name']?.toString() ?? 'متجرك';

    return Scaffold(
      appBar: AppBar(
        toolbarHeight: 82,
        titleSpacing: 16,
        title: Row(
          children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(color: const Color(0xFF071D3A), borderRadius: BorderRadius.circular(15)),
              child: const Icon(Icons.storefront_rounded, color: Color(0xFFFF7A00), size: 26),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Yalla Partner', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                const SizedBox(height: 1),
                Text(storeName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Color(0xFF7A8595))),
              ]),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'الفروع',
            onPressed: _openBranches,
            icon: const Icon(Icons.account_tree_outlined),
          ),
          IconButton(
            tooltip: 'تشغيل المتجر',
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => OperationsSettingsScreen(api: widget.session.api))),
            icon: const Icon(Icons.settings_suggest_outlined),
          ),
          Padding(
            padding: const EdgeInsetsDirectional.only(end: 12),
            child: IconButton(
              tooltip: 'الإشعارات',
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => PartnerNotificationsScreen(api: widget.session.api))),
              style: IconButton.styleFrom(backgroundColor: Colors.white, foregroundColor: const Color(0xFF071D3A), side: const BorderSide(color: Color(0xFFDDE2EA))),
              icon: const Icon(Icons.notifications_none_rounded),
            ),
          ),
        ],
      ),
      body: IndexedStack(index: _index, children: pages),
      bottomNavigationBar: SafeArea(
        top: false,
        child: Container(
          decoration: const BoxDecoration(boxShadow: [BoxShadow(color: Color(0x12071D3A), blurRadius: 18, offset: Offset(0, -4))]),
          child: NavigationBar(
            selectedIndex: _index,
            onDestinationSelected: (value) => setState(() => _index = value),
            destinations: const [
              NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard_rounded), label: 'الرئيسية'),
              NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long_rounded), label: 'الطلبات'),
              NavigationDestination(icon: Icon(Icons.inventory_2_outlined), selectedIcon: Icon(Icons.inventory_2_rounded), label: 'المنتجات'),
              NavigationDestination(icon: Icon(Icons.tune_outlined), selectedIcon: Icon(Icons.tune_rounded), label: 'الإضافات'),
              NavigationDestination(icon: Icon(Icons.store_outlined), selectedIcon: Icon(Icons.store_rounded), label: 'المتجر'),
            ],
          ),
        ),
      ),
    );
  }
}
