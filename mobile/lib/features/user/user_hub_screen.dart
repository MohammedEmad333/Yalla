import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
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
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
          children: [
            _HubCard(
              icon: Icons.bookmarks_outlined,
              title: 'العناوين والكوبونات وإعادة الطلب',
              subtitle: 'أدر عناوينك المحفوظة، أعد طلبًا سابقًا، واستعرض الكوبونات.',
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => UserToolsScreen(api: api)),
              ),
            ),
            const SizedBox(height: 10),
            _HubCard(
              icon: Icons.favorite_outline_rounded,
              title: 'إدارة المتاجر المفضلة',
              subtitle: 'اعرض المتاجر المحفوظة وأزل أي متجر بنقرة واحدة.',
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => FavoritesManageScreen(api: api)),
              ),
            ),
            const SizedBox(height: 10),
            _HubCard(
              icon: Icons.card_giftcard_outlined,
              title: 'النقاط والدعوات والشكاوى',
              subtitle: 'تابع نقاط Yalla، استخدم رمز دعوة، وقدّم مشكلة أو طلب استرداد.',
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => RewardsIssuesScreen(api: api)),
              ),
            ),
          ],
        ),
      );
}

class _HubCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _HubCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) => Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(20),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: YallaColors.card,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: YallaColors.outline),
            ),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: YallaColors.primary.withValues(alpha: .10),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(icon, color: YallaColors.primary),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        subtitle,
                        style: TextStyle(
                          color: YallaColors.muted,
                          height: 1.45,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Icon(Icons.chevron_left_rounded, color: YallaColors.muted),
              ],
            ),
          ),
        ),
      );
}
