import 'package:flutter/material.dart';

import '../core/session.dart';
import 'menu_screen.dart';
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

  @override
  Widget build(BuildContext context) {
    final pages = [
      OrdersScreen(api: widget.session.api),
      MenuScreen(api: widget.session.api),
      StoreScreen(api: widget.session.api, onLogout: widget.session.logout),
    ];
    final merchant = widget.session.merchant.value ?? {};
    final restaurant = merchant['restaurant'] is Map ? merchant['restaurant'] as Map : {};
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Yalla Partner', style: TextStyle(fontWeight: FontWeight.w800)),
            Text(
              restaurant['name']?.toString() ?? merchant['name']?.toString() ?? '',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
      body: IndexedStack(index: _index, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (value) => setState(() => _index = value),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long_rounded), label: 'الطلبات'),
          NavigationDestination(icon: Icon(Icons.inventory_2_outlined), selectedIcon: Icon(Icons.inventory_2_rounded), label: 'المنتجات'),
          NavigationDestination(icon: Icon(Icons.store_outlined), selectedIcon: Icon(Icons.store_rounded), label: 'المتجر'),
        ],
      ),
    );
  }
}
