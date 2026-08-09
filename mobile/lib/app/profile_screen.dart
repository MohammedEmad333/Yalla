// شاشة الحساب — تسجيل الخروج (وقابلة للتوسّع لاحقًا: العناوين، الإعدادات...).

import 'package:flutter/material.dart';

class ProfileScreen extends StatelessWidget {
  final VoidCallback onLogout;
  const ProfileScreen({super.key, required this.onLogout});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('حسابي')),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircleAvatar(radius: 40, child: Icon(Icons.person, size: 40)),
            const SizedBox(height: 24),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
              onPressed: onLogout,
              icon: const Icon(Icons.logout),
              label: const Text('تسجيل الخروج'),
            ),
          ],
        ),
      ),
    );
  }
}
