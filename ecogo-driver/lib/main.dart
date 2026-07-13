import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:ecogo_core/ecogo_core.dart';
import 'state/app_state.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  final app = AppState(prefs);

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
      child: const EcogoDriverApp(),
    ),
  );
}

class EcogoDriverApp extends StatefulWidget {
  const EcogoDriverApp({super.key});
  @override
  State<EcogoDriverApp> createState() => _EcogoDriverAppState();
}

class _EcogoDriverAppState extends State<EcogoDriverApp> with WidgetsBindingObserver {
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
    // so live GPS sharing and chat resume after the OS suspended the connection.
    if (state == AppLifecycleState.resumed) {
      context.read<AppState>().onResumed();
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ECOGO Tài xế',
      debugShowCheckedModeBanner: false,
      theme: ecogoTheme(),
      home: Consumer<AppState>(
        builder: (_, app, __) => app.isLoggedIn ? const HomeScreen() : const LoginScreen(),
      ),
    );
  }
}
