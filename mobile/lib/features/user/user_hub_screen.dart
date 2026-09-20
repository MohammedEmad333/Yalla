import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import 'favorites_manage_screen.dart';
import 'rewards_issues_screen.dart';
import 'user_tools_screen.dart';

class UserHubScreen extends StatelessWidget {
  final ApiClient api;
  const UserHubScreen({super.key, required this.api});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('محفوظاتي والعروض')),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: ListTile(
                leading: const CircleAvatar(child: Icon(Icons.bookmarks_outlined)),
                title: const Text('العناوين والكوبونات وإعادة الطلب'),
                subtitle: const Text('أدر عناوينك المحفوظة، أعد طلبًا سابقًا، واستعرض الكوبونات.'),
                trailing: const Icon(Icons.chevron_left),
                onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => UserToolsScreen(api: api))),
              ),
            ),
            const SizedBox(height: 10),
            Card(
              child: ListTile(
                leading: const CircleAvatar(child: Icon(Icons.favorite_outline)),
                title: const Text('إدارة المتاجر المفضلة'),
                subtitle: const Text('أضف أي متجر للمفضلة أو أزله بنقرة واحدة.'),
                trailing: const Icon(Icons.chevron_left),
                onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => FavoritesManageScreen(api: api))),
              ),
            ),
            const SizedBox(height: 10),
            Card(
              child: ListTile(
                leading: const CircleAvatar(child: Icon(Icons.card_giftcard_outlined)),
                title: const Text('النقاط والدعوات والشكاوى'),
                subtitle: const Text('تابع نقاط Yalla، استخدم رمز دعوة، وقدّم مشكلة أو طلب استرداد لطلب سابق.'),
                trailing: const Icon(Icons.chevron_left),
                onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => RewardsIssuesScreen(api: api))),
              ),
            ),
          ],
        ),
      );
}
