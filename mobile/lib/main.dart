// نقطة دخول تطبيق يلا (Flutter).
// يهيّئ الخدمات المشتركة، يفرض اتجاه RTL، ويقرّر الوجهة حسب جلسة الدخول.

import 'package:flutter/material.dart';

import 'core/network/api_client.dart';
import 'core/realtime/socket_service.dart';
import 'core/storage/token_storage.dart';
import 'features/auth/data/auth_repository.dart';
import 'features/auth/presentation/login_screen.dart';
import 'features/auth/presentation/register_screen.dart';
import 'app/user_home.dart';
import 'app/captain_home.dart';

// خدمات على مستوى التطبيق (حاوية اعتماديّات بسيطة)
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
      theme: ThemeData(
        useMaterial3: true,
        colorSchemeSeed: const Color(0xFF16A34A), // أخضر يلا
      ),
      // نفرض RTL على كامل التطبيق
      builder: (context, child) =>
          Directionality(textDirection: TextDirection.rtl, child: child!),
      home: const AuthGate(),
    );
  }
}

/// بوابة المصادقة: تستعيد الجلسة وتوجّه للوجهة المناسبة.
class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  late Future<AuthSession?> _future;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() => _future = authRepository.restoreSession();

  Future<void> _logout() async {
    await authRepository.logout();
    setState(_reload);
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<AuthSession?>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }

        final session = snap.data;
        if (session == null) {
          return LoginFlow(onLoggedIn: () => setState(_reload));
        }

        // توجيه حسب الدور
        if (session.role == 'captain') {
          return CaptainHome(api: apiClient, socket: socketService, onLogout: _logout);
        }
        return UserHome(api: apiClient, socket: socketService, onLogout: _logout);
      },
    );
  }
}

/// تدفّق تسجيل الدخول: اختيار الدور ثم دخول/إنشاء حساب.
class LoginFlow extends StatefulWidget {
  final VoidCallback onLoggedIn;
  const LoginFlow({super.key, required this.onLoggedIn});

  @override
  State<LoginFlow> createState() => _LoginFlowState();
}

enum _Stage { chooseRole, userLogin, userRegister, captainLogin }

class _LoginFlowState extends State<LoginFlow> {
  _Stage _stage = _Stage.chooseRole;

  @override
  Widget build(BuildContext context) {
    switch (_stage) {
      case _Stage.userLogin:
        return LoginScreen(
          authRepository: authRepository,
          onLoggedIn: widget.onLoggedIn,
          onGoToRegister: () => setState(() => _stage = _Stage.userRegister),
        );
      case _Stage.userRegister:
        return RegisterScreen(
          authRepository: authRepository,
          onRegistered: widget.onLoggedIn,
          onBackToLogin: () => setState(() => _stage = _Stage.userLogin),
        );
      case _Stage.captainLogin:
        return LoginScreen(
          authRepository: authRepository,
          isCaptain: true,
          onLoggedIn: widget.onLoggedIn,
        );
      case _Stage.chooseRole:
        return _RoleChooser(
          onUser: () => setState(() => _stage = _Stage.userLogin),
          onCaptain: () => setState(() => _stage = _Stage.captainLogin),
        );
    }
  }
}

class _RoleChooser extends StatelessWidget {
  final VoidCallback onUser;
  final VoidCallback onCaptain;
  const _RoleChooser({required this.onUser, required this.onCaptain});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('🛵 يلا', style: TextStyle(fontSize: 48, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              const Text('اختر نوع الحساب', style: TextStyle(fontSize: 16)),
              const SizedBox(height: 32),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: onUser,
                  icon: const Icon(Icons.person),
                  label: const Text('دخول كمستخدم'),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: onCaptain,
                  icon: const Icon(Icons.motorcycle),
                  label: const Text('دخول ككابتن'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
