import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'core/api_client.dart';
import 'core/session.dart';
import 'core/token_storage.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';

final tokenStorage = TokenStorage();
final apiClient = ApiClient(tokenStorage);
final partnerSession = PartnerSession(apiClient, tokenStorage);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await partnerSession.restore();
  runApp(const YallaPartnerApp());
}

class YallaPartnerApp extends StatelessWidget {
  const YallaPartnerApp({super.key});

  @override
  Widget build(BuildContext context) {
    const seed = Color(0xFFF6A800);
    final scheme = ColorScheme.fromSeed(
      seedColor: seed,
      brightness: Brightness.light,
      surface: const Color(0xFFFFFBF3),
    );
    return MaterialApp(
      title: 'Yalla Partner',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: scheme,
        textTheme: GoogleFonts.ibmPlexSansArabicTextTheme(),
        scaffoldBackgroundColor: const Color(0xFFF6F7FB),
        appBarTheme: const AppBarTheme(
          backgroundColor: Colors.transparent,
          surfaceTintColor: Colors.transparent,
          centerTitle: false,
        ),
        cardTheme: const CardThemeData(
          elevation: 0,
          margin: EdgeInsets.zero,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(22)),
          ),
        ),
        inputDecorationTheme: const InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.all(Radius.circular(14)),
            borderSide: BorderSide.none,
          ),
        ),
        navigationBarTheme: const NavigationBarThemeData(
          height: 72,
          indicatorShape: StadiumBorder(),
          backgroundColor: Colors.white,
        ),
      ),
      builder: (context, child) => Directionality(
        textDirection: TextDirection.rtl,
        child: child!,
      ),
      home: ValueListenableBuilder<Map<String, dynamic>?>(
        valueListenable: partnerSession.merchant,
        builder: (_, merchant, __) => merchant == null
            ? LoginScreen(session: partnerSession)
            : HomeScreen(session: partnerSession),
      ),
    );
  }
}
