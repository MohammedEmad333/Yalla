// الشاشة الرئيسية لتطبيق المستخدم — تنقّل سفلي بين الشاشات.

import 'package:flutter/material.dart';

import '../core/network/api_client.dart';
import '../core/realtime/socket_service.dart';
import '../features/user/create_order_screen.dart';
import '../features/user/my_orders_screen.dart';
import '../features/wallet/presentation/wallet_screen.dart';
import '../features/notifications/notifications_screen.dart';
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

  @override
  void initState() {
    super.initState();
    widget.socket.connect(); // اتصال لحظي لاستقبال تحديثات الطلبات
  }

  @override
  void dispose() {
    widget.socket.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // كل شاشة تحمل Scaffold خاصّتها؛ نبقيها حيّة عبر IndexedStack
    final pages = [
      CreateOrderScreen(api: widget.api),
      MyOrdersScreen(api: widget.api),
      WalletScreen(api: widget.api, socket: widget.socket),
      NotificationsScreen(api: widget.api, socket: widget.socket),
      ProfileScreen(onLogout: widget.onLogout),
    ];

    return Scaffold(
      body: IndexedStack(index: _index, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.add_location_alt), label: 'طلب'),
          NavigationDestination(icon: Icon(Icons.receipt_long), label: 'طلباتي'),
          NavigationDestination(icon: Icon(Icons.account_balance_wallet), label: 'المحفظة'),
          NavigationDestination(icon: Icon(Icons.notifications), label: 'الإشعارات'),
          NavigationDestination(icon: Icon(Icons.person), label: 'حسابي'),
        ],
      ),
    );
  }
}
