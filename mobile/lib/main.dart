// نقطة دخول تطبيق يلا (Flutter).
// يهيّئ الخدمات، يفرض RTL، ويقود الواجهة بحالة الجلسة (صفحة دخول واحدة للجميع).

import 'package:flutter/material.dart';

import 'core/theme/app_theme.dart';
import 'core/network/api_client.dart';
import 'core/realtime/socket_service.dart';
import 'core/storage/token_storage.dart';
import 'features/auth/data/auth_repository.dart';
import 'features/auth/presentation/login_screen.dart';
import 'app/user_home.dart';
import 'app/captain_home.dart';

// خدمات على مستوى التطبيق
final tokenStorage = TokenStorage();
final apiClient = ApiClient(tokenStorage);
final socketService = SocketService(tokenStorage);
final authRepository = AuthRepository(apiClient, tokenStorage);

void main() => runApp(const YallaApp());

class YallaApp extends StatelessWidget {
  const YallaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Yalla',
      debugShowCheckedModeBanner: false,
      theme: buildYallaTheme(),
      builder: (context, child) => Directionality(textDirection: TextDirection.rtl, child: child!),
      home: const AuthGate(),
    );
  }
}

/// بوابة المصادقة: تستعيد الجلسة عند الإقلاع ثم تستمع لتغيّرها لتوجيه الواجهة.
class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  bool _restoring = true;

  @override
  void initState() {
    super.initState();
    // استعادة الجلسة مرّة واحدة عند الإقلاع
    authRepository.restore().whenComplete(() {
      if (mounted) setState(() => _restoring = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_restoring) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    // نستمع لحالة الجلسة: أي تغيّر (دخول/خروج) يعيد بناء الواجهة تلقائيًا
    return ValueListenableBuilder<AuthSession?>(
      valueListenable: authRepository.session,
      builder: (context, session, _) {
        if (session == null) {
          return LoginScreen(authRepository: authRepository);
        }
        if (session.role == 'captain') {
          return CaptainHome(api: apiClient, socket: socketService, onLogout: authRepository.logout);
        }
        // مستخدم أو أدمن (الأدمن يستخدم لوحة الويب، لكن نعرض له واجهة المستخدم هنا)
        return UserHome(api: apiClient, socket: socketService, onLogout: authRepository.logout);
      },
    );
  }
}
