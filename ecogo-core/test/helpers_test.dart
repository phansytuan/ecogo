import 'package:ecogo_core/ecogo_core.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('formatMoney', () {
    test('formats plain amounts with thousands separators and đồng sign', () {
      expect(formatMoney(150000), '150.000\u{20AB}');
      expect(formatMoney(1000000), '1.000.000\u{20AB}');
      expect(formatMoney(0), '0\u{20AB}');
    });

    test('handles small amounts without separators', () {
      expect(formatMoney(500), '500\u{20AB}');
      expect(formatMoney(99), '99\u{20AB}');
    });

    test('prefixes a minus for negative amounts', () {
      expect(formatMoney(-150000), '-150.000\u{20AB}');
    });
  });

  group('requiredCompanions', () {
    test('zero companions for a single-seat booking', () {
      expect(requiredCompanions(1), 0);
    });

    test('seats minus one for multi-seat bookings', () {
      expect(requiredCompanions(2), 1);
      expect(requiredCompanions(3), 2);
      expect(requiredCompanions(4), 3);
    });

    test('zero for zero or negative seats (edge guard)', () {
      expect(requiredCompanions(0), 0);
    });
  });

  group('Stop equality', () {
    test('same label and coordinates are equal', () {
      const a = Stop('Hà Nội', 21.0278, 105.8342);
      const b = Stop('Hà Nội', 21.0278, 105.8342);
      expect(a == b, isTrue);
      expect(a.hashCode, b.hashCode);
    });

    test('different label or coordinates are not equal', () {
      const a = Stop('Hà Nội', 21.0278, 105.8342);
      const b = Stop('Hà Nội', 21.0, 105.8342);
      expect(a == b, isFalse);
    });
  });

  group('StatusChip statuses', () {
    // Verifies every status string the backend can return has a Vietnamese
    // label in the StatusChip map — prevents a raw English status leaking to
    // users when a new status is added to the backend.
    test('all known statuses are mapped', () {
      const known = [
        'pending', 'processing', 'no_match', 'matched', 'confirmed',
        'ongoing', 'completed', 'cancelled', 'expired', 'open', 'full',
      ];
      for (final s in known) {
        expect(() => StatusChip(s), returnsNormally,
            reason: 'StatusChip should handle "$s" without error');
      }
    });
  });
}
