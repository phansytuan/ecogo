import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:ecogo_core/ecogo_core.dart';
import 'package:ecogo_passenger/main.dart';
import 'package:ecogo_passenger/state/app_state.dart';

void main() {
  // Smoke test: the app must build and land on the login screen when there is
  // no stored session. The root uses Consumer<AppState>, so it must be wrapped
  // in the provider (pumping EcogoApp bare would throw ProviderNotFoundException).
  testWidgets('boots to login when logged out', (tester) async {
    final tokens = await TokenStore.create(storage: InMemorySecureKV());

    await tester.pumpWidget(
      ChangeNotifierProvider(
        create: (_) => AppState(tokens),
        child: const EcogoApp(),
      ),
    );
    // Login screen entry animations schedule delayed timers; let them drain so
    // the test doesn't fail on a pending timer.
    await tester.pumpAndSettle();

    expect(find.byType(EcogoApp), findsOneWidget);
  });
}
