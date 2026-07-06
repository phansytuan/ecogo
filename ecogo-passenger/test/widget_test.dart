import 'package:flutter_test/flutter_test.dart';
import 'package:ecogo_passenger/main.dart';

void main() {
  testWidgets('EcogoApp smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const EcogoApp());
    expect(find.byType(EcogoApp), findsOneWidget);
  });
}
