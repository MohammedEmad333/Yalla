// الشاشة الرئيسية لتطبيق الكابتن — تنقّل سفلي بين الشاشات.

import 'package:flutter/material.dart';

import '../core/network/api_client.dart';
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

  @override
  void initState() {
    super.initState();
    widget.socket.connect(); // اتصال لحظي لاستقبال الطلبات المُسنَدة
  }

  @override
  void dispose() {
    widget.socket.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      ActiveOrderScreen(api: widget.api, socket: widget.socket),
      EarningsScreen(api: widget.api, socket: widget.socket),
      CaptainWalletScreen(api: widget.api, socket: widget.socket),
      NotificationsScreen(api: widget.api, socket: widget.socket),
      ProfileScreen(api: widget.api, onLogout: widget.onLogout),
    ];

    return Scaffold(
      body: IndexedStack(index: _index, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.local_shipping), label: 'الطلب'),
          NavigationDestination(icon: Icon(Icons.trending_up), label: 'أرباحي'),
          NavigationDestination(icon: Icon(Icons.account_balance_wallet), label: 'محفظتي'),
          NavigationDestination(icon: Icon(Icons.notifications), label: 'الإشعارات'),
          NavigationDestination(icon: Icon(Icons.person), label: 'حسابي'),
        ],
      ),
    );
  }
}
