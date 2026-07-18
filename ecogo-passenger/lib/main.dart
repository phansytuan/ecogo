import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:ecogo_core/ecogo_core.dart';
import 'state/app_state.dart';
import 'screens/login_screen.dart';
import 'screens/search_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  final tokens = await TokenStore.create(legacyPrefs: prefs);
  final app = AppState(tokens);

  // --- Push notifications integration seam ---------------------------------
  // The app is push-ready: once you add firebase_messaging (with native config),
  // wire it here without touching app logic:
  //
  //   await Firebase.initializeApp();
  //   final fcm = FirebaseMessaging.instance;
  //   await fcm.requestPermission();
  //   final token = await fcm.getToken();
  //   if (token != null) await app.setPushToken(token, platform: defaultTargetPlatform.name);
  //   fcm.onTokenRefresh.listen((t) => app.setPushToken(t));
  //
  // setPushToken() safely stores the token until the user is authenticated,
  // then registers it with the backend (/notifications/token).
  // -------------------------------------------------------------------------

  runApp(
    ChangeNotifierProvider.value(
      value: app,
      child: const EcogoApp(),
    ),
  );
}

class EcogoApp extends StatefulWidget {
  const EcogoApp({super.key});
  @override
  State<EcogoApp> createState() => _EcogoAppState();
}

class _EcogoAppState extends State<EcogoApp> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Re-establish the realtime socket when the app returns to the foreground,
    // so live tracking/chat resume after the OS suspended the connection.
    if (state == AppLifecycleState.resumed) {
      context.read<AppState>().onResumed();
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ECOGO',
      debugShowCheckedModeBanner: false,
      theme: ecogoTheme(),
      home: Consumer<AppState>(
        builder: (_, app, __) => app.isLoggedIn ? const SearchScreen() : const LoginScreen(),
      ),
    );
  }
}
