import '../models/ride.dart';
import '../models/ride_booking.dart';
import '../models/stop.dart';
import 'api_client.dart';

class RidesService {
  final ApiClient api;
  RidesService(this.api);

  Future<Ride> post({
    required String vehicleId,
    required Stop origin,
    required Stop dest,
    required DateTime departureTime,
    required int totalSeats,
    int? pricePerSeat,
  }) async {
    final r = await api.post('/rides', {
      'vehicleId': vehicleId,
      'origin': {'lat': origin.lat, 'lng': origin.lng, 'label': origin.label},
      'dest': {'lat': dest.lat, 'lng': dest.lng, 'label': dest.label},
      'departureTime': departureTime.toUtc().toIso8601String(),
      'totalSeats': totalSeats,
      'pricePerSeat': pricePerSeat,
    });
    return Ride.fromJson(r as Map<String, dynamic>);
  }

  Future<List<Ride>> mine() async {
    final r = await api.get('/rides/mine');
    return (r as List).map((e) => Ride.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<RideBooking>> bookings(String rideId) async {
    final r = await api.get('/rides/$rideId/bookings');
    return (r as List).map((e) => RideBooking.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> cancel(String rideId) async {
    await api.post('/rides/$rideId/cancel');
  }
}
