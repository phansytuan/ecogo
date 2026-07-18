import 'package:ecogo_core/ecogo_core.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('stopToJson', () {
    test('includes placeId and location source when placeId is set', () {
      final stop = Stop(
        '123 Nguyễn Huệ',
        10.7731,
        106.7032,
        placeId: 'place-1',
        locationSource: LocationSource.mapPin,
      );

      expect(stopToJson(stop), {
        'lat': 10.7731,
        'lng': 106.7032,
        'label': '123 Nguyễn Huệ',
        'placeId': 'place-1',
        'locationSource': 'MAP_PIN',
      });
    });

    test('omits placeId when it is not set', () {
      final stop = Stop('Bến Thành', 10.7725, 106.6980);

      final json = stopToJson(stop);
      expect(json, {
        'lat': 10.7725,
        'lng': 106.6980,
        'label': 'Bến Thành',
        'locationSource': 'MANUAL_ADDRESS',
      });
      expect(json.containsKey('placeId'), isFalse);
    });
  });
}
