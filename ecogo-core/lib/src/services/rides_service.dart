import '../models/ride.dart';
import '../models/ride_booking.dart';
import '../models/route_quote.dart';
import '../models/itin_stop.dart';
import '../models/dynamic_route.dart';
import '../models/charter_status.dart';
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

  /// Driver marks the ride finished (stamps actual completion time).
  Future<void> complete(String rideId) async {
    await api.post('/rides/$rideId/complete');
  }

  /// Suggested distance/price for the posting form (before any booking).
  Future<RouteQuote> quote({required Stop origin, required Stop dest}) async {
    final r = await api.post('/rides/quote', {
      'origin': {'lat': origin.lat, 'lng': origin.lng, 'label': origin.label},
      'dest': {'lat': dest.lat, 'lng': dest.lng, 'label': dest.label},
    });
    return RouteQuote.fromJson(r as Map<String, dynamic>);
  }

  /// Ordered pickup/dropoff itinerary with ETAs, from the passenger list.
  Future<List<ItinStop>> itinerary(String rideId) async {
    final r = await api.get('/rides/$rideId/itinerary');
    final stops = (r as Map<String, dynamic>)['stops'] as List;
    return stops.map((e) => ItinStop.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Route re-computed through the current passengers' pickup/dropoff points,
  /// with ETAs from the provider's real per-leg durations.
  Future<DynamicRoute> dynamicRoute(String rideId) async {
    final r = await api.get('/rides/$rideId/route');
    return DynamicRoute.fromJson(r as Map<String, dynamic>);
  }

  /// Charter availability + the next committed pickup constraint.
  Future<CharterStatus> charterStatus(String rideId) async {
    final r = await api.get('/rides/$rideId/charter');
    return CharterStatus.fromJson(r as Map<String, dynamic>);
  }

  /// Could the driver take a charter from [lat],[lng] and still make the pickup?
  Future<CharterFeasibility> checkCharter(
    String rideId, {
    required double lat,
    required double lng,
    int charterDurationS = 0,
  }) async {
    final r = await api.post('/rides/$rideId/charter/check', {
      'from': {'lat': lat, 'lng': lng},
      'charterDurationS': charterDurationS,
    });
    return CharterFeasibility.fromJson(r as Map<String, dynamic>);
  }

  Future<void> setCharterOptOut(String rideId, bool optOut) async {
    await api.post('/rides/$rideId/charter/opt-out', {'optOut': optOut});
  }
}
