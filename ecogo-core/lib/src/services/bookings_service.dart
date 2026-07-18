import '../models/booking.dart';
import '../models/companion.dart';
import '../models/fare_quote.dart';
import '../models/stop.dart';
import 'api_client.dart';

class BookingsService {
  final ApiClient api;
  BookingsService(this.api);

  /// Fare quote for a pickup/dropoff pair: passenger road distance x rate.
  Future<FareQuote> quote({
    required Stop pickup,
    required Stop dropoff,
    int seats = 1,
  }) async {
    final r = await api.post('/bookings/quote', {
      'pickup': stopToJson(pickup),
      'dropoff': stopToJson(dropoff),
      'seats': seats,
    });
    return FareQuote.fromJson(r as Map<String, dynamic>);
  }

  Future<Booking> book({
    required String rideId,
    required Stop pickup,
    required Stop dropoff,
    int seats = 1,
    String? pickupAddress,
    String? dropoffAddress,
    List<Companion> companions = const [],
    List<String> seatIds = const [],
  }) async {
    final r = await api.post('/bookings', {
      'rideId': rideId,
      'pickup': stopToJson(pickup),
      'dropoff': stopToJson(dropoff),
      'seats': seats,
      if (pickupAddress != null && pickupAddress.trim().isNotEmpty)
        'pickupAddress': pickupAddress.trim(),
      if (dropoffAddress != null && dropoffAddress.trim().isNotEmpty)
        'dropoffAddress': dropoffAddress.trim(),
      if (companions.isNotEmpty) 'companions': companions.map((c) => c.toJson()).toList(),
      if (seatIds.isNotEmpty) 'seatIds': seatIds,
    });
    return Booking.fromJson(r as Map<String, dynamic>);
  }

  Future<List<Booking>> mine() async {
    final r = await api.get('/bookings/mine');
    return (r as List).map((e) => Booking.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> confirm(String bookingId) async {
    await api.post('/bookings/$bookingId/confirm');
  }

  Future<void> cancel(String bookingId) async {
    await api.post('/bookings/$bookingId/cancel');
  }
}
