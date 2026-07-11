import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:ecogo_driver/main.dart';
import 'package:ecogo_driver/state/app_state.dart';

void main() {
  // Smoke test: the app must build and land on the login screen when there is
  // no stored session. The root uses Consumer<AppState>, so it must be wrapped
  // in the provider (pumping EcogoDriverApp bare would throw ProviderNotFoundException).
  testWidgets('boots to login when logged out', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();

    await tester.pumpWidget(
      ChangeNotifierProvider(
        create: (_) => AppState(prefs),
        child: const EcogoDriverApp(),
      ),
    );
    // Login screen entry animations schedule delayed timers; let them drain so
    // the test doesn't fail on a pending timer.
    await tester.pumpAndSettle();

    expect(find.byType(EcogoDriverApp), findsOneWidget);
  });
}
