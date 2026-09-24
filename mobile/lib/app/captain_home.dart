// الشاشة الرئيسية لتطبيق الكابتن — تنقّل سفلي على الجوال وجانبي على الديسكتوب.

import 'package:flutter/material.dart';

import '../core/network/api_client.dart';
import '../core/onboarding/onboarding.dart';
import '../core/realtime/socket_service.dart';
import '../features/captain/active_order_screen.dart';
import '../features/captain/earnings_screen.dart';
import '../features/captain/wallet_screen.dart';
import '../features/notifications/notifications_screen.dart';
import 'profile_screen.dart';

class CaptainHome extends StatefulWidget {
  final ApiClient api;
  final SocketService socket;
  final VoidCallback onLogout;
  const CaptainHome({super.key, required this.api, required this.socket, required this.onLogout});

  @override
  State<CaptainHome> createState() => _CaptainHomeState();
}

class _CaptainHomeState extends State<CaptainHome> {
  int _index = 0;
  late final List<Widget> _pages;

  static const _labels = ['الطلب', 'أرباحي', 'محفظتي', 'الإشعارات', 'حسابي'];
  static const _icons = [
    Icons.local_shipping_outlined,
    Icons.trending_up_outlined,
    Icons.account_balance_wallet_outlined,
    Icons.notifications_none,
    Icons.person_outline,
  ];
  static const _selectedIcons = [
    Icons.local_shipping,
    Icons.trending_up,
    Icons.account_balance_wallet,
    Icons.notifications,
    Icons.person,
  ];

  @override
  void initState() {
    super.initState();
    _pages = [
      ActiveOrderScreen(api: widget.api, socket: widget.socket),
      EarningsScreen(api: widget.api, socket: widget.socket),
      CaptainWalletScreen(api: widget.api, socket: widget.socket),
      NotificationsScreen(api: widget.api, socket: widget.socket),
      ProfileScreen(api: widget.api, onLogout: widget.onLogout),
    ];
    widget.socket.connect();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) maybeShowOnboarding(context, 'captain');
    });
  }

  @override
  void dispose() {
    widget.socket.dispose();
    super.dispose();
  }

  Widget _desktop(List<Widget> pages) {
    return Scaffold(
      body: Row(
        children: [
          SafeArea(
            child: NavigationRail(
              minWidth: 88,
              minExtendedWidth: 220,
              extended: true,
              selectedIndex: _index,
              onDestinationSelected: (i) => setState(() => _index = i),
              leading: const Padding(
                padding: EdgeInsets.fromLTRB(16, 18, 16, 24),
                child: Text(
                  'Yalla Captain',
                  style: TextStyle(fontSize: 23, fontWeight: FontWeight.w900),
                ),
              ),
              destinations: List.generate(
                _labels.length,
                (i) => NavigationRailDestination(
                  icon: Icon(_icons[i]),
                  selectedIcon: Icon(_selectedIcons[i]),
                  label: Text(_labels[i]),
                ),
              ),
            ),
          ),
          const VerticalDivider(width: 1),
          Expanded(
            child: ColoredBox(
              color: Theme.of(context).scaffoldBackgroundColor,
              child: Align(
                alignment: Alignment.topCenter,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 1440),
                  child: IndexedStack(index: _index, children: pages),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _mobile(List<Widget> pages) {
    return Scaffold(
      body: IndexedStack(index: _index, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: List.generate(
          _labels.length,
          (i) => NavigationDestination(
            icon: Icon(_icons[i]),
            selectedIcon: Icon(_selectedIcons[i]),
            label: _labels[i],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pages = _pages;
    return LayoutBuilder(
      builder: (context, constraints) {
        return constraints.maxWidth >= 1000 ? _desktop(pages) : _mobile(pages);
      },
    );
  }
}
