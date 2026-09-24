// نقطة دخول تطبيق يلا (Flutter).
// يهيّئ الخدمات، يفرض RTL، ويقود الواجهة بحالة الجلسة (صفحة دخول واحدة للجميع).

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'core/theme/app_theme.dart';
import 'core/theme/theme_controller.dart';
import 'core/network/api_client.dart';
import 'core/performance/performance_monitor.dart';
import 'core/realtime/socket_service.dart';
import 'core/storage/token_storage.dart';
import 'core/push/push_service.dart';
import 'core/update/app_update_service.dart';
import 'features/auth/data/auth_repository.dart';
import 'features/auth/presentation/login_screen.dart';
import 'app/user_home.dart';
import 'app/captain_home.dart';

final tokenStorage = TokenStorage();
final apiClient = ApiClient(tokenStorage);
final socketService = SocketService(tokenStorage);
final authRepository = AuthRepository(apiClient, tokenStorage);
final pushService = PushService(apiClient);
final themeController = ThemeController();
final appUpdateService = AppUpdateService(apiClient);
final appNavigatorKey = GlobalKey<NavigatorState>();

Future<void> handleLogout() async {
  await pushService.unregister();
  await authRepository.logout();
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    systemNavigationBarColor: Colors.transparent,
    systemNavigationBarDividerColor: Colors.transparent,
    systemStatusBarContrastEnforced: false,
    systemNavigationBarContrastEnforced: false,
  ));
  // Push bootstrap and theme restore are independent; running them in parallel
  // trims startup latency, especially on slower devices/storage.
  await Future.wait<void>([
    PushService.initialize(),
    themeController.restore().timeout(
      const Duration(milliseconds: 800),
      onTimeout: () {},
    ),
  ]);
  if (kDebugMode || kProfileMode) PerformanceMonitor.start();
  authRepository.session.addListener(() {
    if (authRepository.session.value != null) pushService.registerAfterLogin();
  });
  runApp(const YallaApp());
}

class YallaApp extends StatefulWidget {
  const YallaApp({super.key});

  @override
  State<YallaApp> createState() => _YallaAppState();
}

class _YallaAppState extends State<YallaApp> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _checkForUpdate());
  }

  Future<void> _checkForUpdate() async {
    final context = appNavigatorKey.currentContext;
    if (context != null) await appUpdateService.checkAndShow(context);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _checkForUpdate());
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangePlatformBrightness() => setState(() {});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: themeController.mode,
      builder: (context, mode, _) {
        final systemDark = WidgetsBinding.instance.platformDispatcher.platformBrightness == Brightness.dark;
        final isDark = mode == ThemeMode.dark || (mode == ThemeMode.system && systemDark);
        YallaColors.brightness = isDark ? Brightness.dark : Brightness.light;
        return _buildApp(mode);
      },
    );
  }

  Widget _buildApp(ThemeMode mode) {
    return MaterialApp(
      navigatorKey: appNavigatorKey,
      title: 'Yalla',
      debugShowCheckedModeBanner: false,
      theme: buildYallaTheme(Brightness.light),
      darkTheme: buildYallaTheme(Brightness.dark),
      themeMode: mode,
      builder: (context, child) => Directionality(
        textDirection: TextDirection.rtl,
        child: ResponsiveWebShell(child: child!),
      ),
      home: const AuthGate(),
    );
  }
}

class ResponsiveWebShell extends StatelessWidget {
  final Widget child;
  const ResponsiveWebShell({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return child;
  }
}

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
    authRepository.restore().whenComplete(() {
      if (mounted) setState(() => _restoring = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_restoring) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    return ValueListenableBuilder<AuthSession?>(
      valueListenable: authRepository.session,
      builder: (context, session, _) {
        if (session == null) {
          return LoginScreen(authRepository: authRepository);
        }
        if (session.role == 'captain') {
          return CaptainHome(api: apiClient, socket: socketService, onLogout: handleLogout);
        }
        return UserHome(api: apiClient, socket: socketService, onLogout: handleLogout);
      },
    );
  }
}
