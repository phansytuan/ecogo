import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'state/app_state.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  runApp(
    ChangeNotifierProvider(
      create: (_) => AppState(prefs),
      child: const EcogoDriverApp(),
    ),
  );
}

class EcogoDriverApp extends StatelessWidget {
  const EcogoDriverApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ECOGO Tài xế',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorSchemeSeed: const Color(0xFF2D6A4F), useMaterial3: true),
      home: Consumer<AppState>(
        builder: (_, app, __) => app.isLoggedIn ? const HomeScreen() : const LoginScreen(),
      ),
    );
  }
}
