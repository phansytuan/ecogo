import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'state/app_state.dart';
import 'screens/login_screen.dart';
import 'screens/search_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  runApp(
    ChangeNotifierProvider(
      create: (_) => AppState(prefs),
      child: const EcogoApp(),
    ),
  );
}

class EcogoApp extends StatelessWidget {
  const EcogoApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ECOGO',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorSchemeSeed: const Color(0xFFC96442), useMaterial3: true),
      home: Consumer<AppState>(
        builder: (_, app, __) => app.isLoggedIn ? const SearchScreen() : const LoginScreen(),
      ),
    );
  }
}
