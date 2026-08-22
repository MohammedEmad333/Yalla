// نقطة دخول تطبيق يلا (Flutter).
// يهيّئ الخدمات، يفرض RTL، ويقود الواجهة بحالة الجلسة (صفحة دخول واحدة للجميع).

import 'package:flutter/material.dart';

import 'core/theme/app_theme.dart';
import 'core/network/api_client.dart';
import 'core/realtime/socket_service.dart';
import 'core/storage/token_storage.dart';
import 'core/push/push_service.dart';
import 'features/auth/data/auth_repository.dart';
import 'features/auth/presentation/login_screen.dart';
import 'app/user_home.dart';
import 'app/captain_home.dart';

// خدمات على مستوى التطبيق
final tokenStorage = TokenStorage();
final apiClient = ApiClient(tokenStorage);
final socketService = SocketService(tokenStorage);
final authRepository = AuthRepository(apiClient, tokenStorage);
final pushService = PushService(apiClient);

// تسجيل الخروج مع إلغاء رمز الإشعارات أولًا (قبل مسح التوكن ليمرّ الطلب مصادَقًا).
Future<void> handleLogout() async {
  await pushService.unregister();
  await authRepository.logout();
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // تهيئة إشعارات FCM (آمنة: لا تُعطّل الإقلاع إن لم يُهيّأ Firebase بعد) — Card 22
  await PushService.initialize();
  // عند توفّر جلسة (دخول/استعادة) نسجّل رمز الجهاز في الخادم لاستقبال الإشعارات
  authRepository.session.addListener(() {
    if (authRepository.session.value != null) pushService.registerAfterLogin();
  });
  runApp(const YallaApp());
}

class YallaApp extends StatelessWidget {
  const YallaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Yalla',
      debugShowCheckedModeBanner: false,
      theme: buildYallaTheme(),
      // فرض RTL + غلاف متجاوب يجعل التطبيق مناسبًا لكل الشاشات (Card 60):
      // على الشاشات العريضة (ويب/سطح المكتب) يُعرض المحتوى في عمود بعرض جوال
      // موسَّط بدل التمدّد على كامل العرض، وعلى الجوّالات يبقى بكامل العرض.
      builder: (context, child) => Directionality(
        textDirection: TextDirection.rtl,
        child: ResponsiveWebShell(child: child!),
      ),
      home: const AuthGate(),
    );
  }
}

/// غلاف متجاوب لكل الشاشات (Card 60).
///
/// التطبيق مصمَّم أساسًا للجوّال؛ عند تشغيله على الويب أو نافذة عريضة يتمدّد
/// المحتوى بشكل غير مريح. هذا الغلاف يحصر العرض في عمود بعرض جوّال (٥٠٠ بكسل)
/// موسَّط فوق خلفية داكنة عندما يكون عرض النافذة أكبر من عتبة معيّنة، ويترك
/// الجوّالات الحقيقية بكامل العرض دون أي تغيير.
class ResponsiveWebShell extends StatelessWidget {
  final Widget child;
  const ResponsiveWebShell({super.key, required this.child});

  // أقصى عرض للمحتوى على الشاشات العريضة (بعرض جوّال مريح)
  static const double _maxContentWidth = 500;
  // بدءًا من هذا العرض نُفعّل التوسيط (أجهزة لوحية/سطح المكتب)
  static const double _wideBreakpoint = 600;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        // شاشة ضيّقة (جوّال) → المحتوى بكامل العرض كما هو
        if (constraints.maxWidth <= _wideBreakpoint) return child;

        // شاشة عريضة → عمود موسَّط بعرض جوّال فوق خلفية داكنة
        return ColoredBox(
          color: const Color(0xFF11131A),
          child: Align(
            alignment: Alignment.topCenter,
            child: ConstrainedBox(
              constraints: BoxConstraints(
                maxWidth: _maxContentWidth,
                minHeight: constraints.maxHeight,
                maxHeight: constraints.maxHeight,
              ),
              // Material يضمن خلفية وسطحًا صحيحين للعمود المحصور
              child: Material(color: Theme.of(context).scaffoldBackgroundColor, child: child),
            ),
          ),
        );
      },
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
          return CaptainHome(api: apiClient, socket: socketService, onLogout: handleLogout);
        }
        // مستخدم أو أدمن (الأدمن يستخدم لوحة الويب، لكن نعرض له واجهة المستخدم هنا)
        return UserHome(api: apiClient, socket: socketService, onLogout: handleLogout);
      },
    );
  }
}
