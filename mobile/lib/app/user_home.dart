// الشاشة الرئيسية لتطبيق المستخدم — تنقّل سفلي على الجوال وجانبي على الديسكتوب.

import 'package:flutter/material.dart';

import '../core/network/api_client.dart';
import '../core/onboarding/onboarding.dart';
import '../core/realtime/socket_service.dart';
import '../features/restaurants/presentation/restaurants_screen.dart';
import '../features/user/create_order_screen.dart';
import '../features/user/my_orders_screen.dart';
import '../features/user/user_hub_screen.dart';
import '../features/wallet/presentation/wallet_screen.dart';
import 'profile_screen.dart';

class UserHome extends StatefulWidget {
  final ApiClient api;
  final SocketService socket;
  final VoidCallback onLogout;
  const UserHome({super.key, required this.api, required this.socket, required this.onLogout});

  @override
  State<UserHome> createState() => _UserHomeState();
}

class _UserHomeState extends State<UserHome> {
  int _index = 0;

  static const _labels = ['طلب', 'المتاجر', 'طلباتي', 'محفوظاتي', 'المحفظة', 'حسابي'];
  static const _icons = [
    Icons.add_location_alt_outlined,
    Icons.storefront_outlined,
    Icons.receipt_long_outlined,
    Icons.bookmarks_outlined,
    Icons.account_balance_wallet_outlined,
    Icons.person_outline,
  ];
  static const _selectedIcons = [
    Icons.add_location_alt,
    Icons.storefront,
    Icons.receipt_long,
    Icons.bookmarks,
    Icons.account_balance_wallet,
    Icons.person,
  ];

  @override
  void initState() {
    super.initState();
    widget.socket.connect();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) maybeShowOnboarding(context, 'user');
    });
  }

  @override
  void dispose() {
    widget.socket.dispose();
    super.dispose();
  }

  List<Widget> _pages() => [
        CreateOrderScreen(api: widget.api),
        RestaurantsScreen(api: widget.api),
        MyOrdersScreen(api: widget.api, socket: widget.socket),
        UserHubScreen(api: widget.api),
        WalletScreen(api: widget.api, socket: widget.socket),
        ProfileScreen(api: widget.api, socket: widget.socket, onLogout: widget.onLogout),
      ];

  Widget _desktop(List<Widget> pages) {
    return Scaffold(
      body: Row(
        children: [
          SafeArea(
            child: Container(
              width: 236,
              color: Theme.of(context).colorScheme.surface,
              child: NavigationRailTheme(
                data: NavigationRailThemeData(
                  backgroundColor: Colors.transparent,
                  indicatorColor: const Color(0xFFFFE8D5),
                  selectedIconTheme: const IconThemeData(color: Color(0xFFFF7A00), size: 24),
                  unselectedIconTheme: IconThemeData(color: Theme.of(context).colorScheme.onSurfaceVariant, size: 23),
                  selectedLabelTextStyle: const TextStyle(fontWeight: FontWeight.w900, color: Color(0xFFFF7A00)),
                  unselectedLabelTextStyle: TextStyle(fontWeight: FontWeight.w700, color: Theme.of(context).colorScheme.onSurfaceVariant),
                ),
                child: NavigationRail(
                  minWidth: 84,
                  minExtendedWidth: 236,
                  extended: true,
                  selectedIndex: _index,
                  onDestinationSelected: (i) => setState(() => _index = i),
                  leading: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 18, 16, 26),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 42,
                          height: 42,
                          decoration: BoxDecoration(
                            color: const Color(0xFFFF7A00),
                            borderRadius: BorderRadius.circular(13),
                          ),
                          child: const Icon(Icons.two_wheeler_rounded, color: Colors.white),
                        ),
                        const SizedBox(width: 10),
                        const Text('Yalla', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
                      ],
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
            ),
          ),
          const VerticalDivider(width: 1),
          Expanded(
            child: ColoredBox(
              color: Theme.of(context).scaffoldBackgroundColor,
              child: Align(
                alignment: Alignment.topCenter,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 1260),
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
    final pages = _pages();
    return LayoutBuilder(
      builder: (context, constraints) {
        return constraints.maxWidth >= 1000 ? _desktop(pages) : _mobile(pages);
      },
    );
  }
}
