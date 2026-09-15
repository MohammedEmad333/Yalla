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
    const orange = Color(0xFFFF7A00);
    const navy = Color(0xFF071D3A);
    const background = Color(0xFFF4F6FA);
    const surface = Color(0xFFFFFFFF);

    final base = ColorScheme.fromSeed(
      seedColor: orange,
      brightness: Brightness.light,
    );
    final scheme = base.copyWith(
      primary: orange,
      onPrimary: Colors.white,
      secondary: navy,
      onSecondary: Colors.white,
      surface: surface,
      onSurface: navy,
      surfaceContainerHighest: const Color(0xFFEFF2F7),
      outline: const Color(0xFFDDE2EA),
    );

    final textTheme = GoogleFonts.ibmPlexSansArabicTextTheme().apply(
      bodyColor: navy,
      displayColor: navy,
    );

    return MaterialApp(
      title: 'Yalla Partner',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: scheme,
        textTheme: textTheme,
        scaffoldBackgroundColor: background,
        appBarTheme: const AppBarTheme(
          elevation: 0,
          backgroundColor: Colors.transparent,
          surfaceTintColor: Colors.transparent,
          foregroundColor: navy,
          centerTitle: false,
        ),
        cardTheme: CardThemeData(
          elevation: 0,
          margin: EdgeInsets.zero,
          color: surface,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(24),
            side: const BorderSide(color: Color(0x11071D3A)),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: surface,
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          labelStyle: const TextStyle(color: Color(0xFF657287)),
          hintStyle: const TextStyle(color: Color(0xFF98A1B2)),
          prefixIconColor: const Color(0xFF657287),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: const BorderSide(color: Color(0xFFDDE2EA)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: const BorderSide(color: Color(0xFFDDE2EA)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: const BorderSide(color: orange, width: 1.6),
          ),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: orange,
            foregroundColor: Colors.white,
            minimumSize: const Size(0, 52),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            foregroundColor: navy,
            minimumSize: const Size(0, 52),
            side: const BorderSide(color: Color(0xFFDDE2EA)),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            textStyle: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
        floatingActionButtonTheme: const FloatingActionButtonThemeData(
          backgroundColor: orange,
          foregroundColor: Colors.white,
          elevation: 4,
        ),
        navigationBarTheme: NavigationBarThemeData(
          height: 76,
          elevation: 8,
          backgroundColor: Colors.white,
          indicatorColor: const Color(0xFFFFE7D1),
          indicatorShape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          labelTextStyle: WidgetStateProperty.resolveWith((states) => TextStyle(
                fontSize: 12,
                fontWeight: states.contains(WidgetState.selected) ? FontWeight.w800 : FontWeight.w600,
                color: states.contains(WidgetState.selected) ? navy : const Color(0xFF7A8595),
              )),
        ),
        snackBarTheme: SnackBarThemeData(
          behavior: SnackBarBehavior.floating,
          backgroundColor: navy,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
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
