import '../models/ride.dart';
import '../models/ride_booking.dart';
import '../models/route_quote.dart';
import '../models/itin_stop.dart';
import '../models/dynamic_route.dart';
import '../models/charter_status.dart';
import '../models/seat_map.dart';
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
    List<Stop> waypoints = const [],
  }) async {
    final r = await api.post('/rides', {
      'vehicleId': vehicleId,
      'origin': stopToJson(origin),
      'dest': stopToJson(dest),
      if (waypoints.isNotEmpty) 'waypoints': waypoints.map(stopToJson).toList(),
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
  Future<RouteQuote> quote({
    required Stop origin,
    required Stop dest,
    List<Stop> waypoints = const [],
  }) async {
    final r = await api.post('/rides/quote', {
      'origin': stopToJson(origin),
      'dest': stopToJson(dest),
      if (waypoints.isNotEmpty) 'waypoints': waypoints.map(stopToJson).toList(),
    });
    return RouteQuote.fromJson(r as Map<String, dynamic>);
  }

  /// Change a posted ride's route (only while open/full with no active bookings).
  Future<RouteQuote> updateRoute({
    required String rideId,
    required Stop origin,
    required Stop dest,
    List<Stop> waypoints = const [],
  }) async {
    final r = await api.patch('/rides/$rideId/route', {
      'origin': stopToJson(origin),
      'dest': stopToJson(dest),
      if (waypoints.isNotEmpty) 'waypoints': waypoints.map(stopToJson).toList(),
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

  /// The seat map for a ride (positions + status). Powers the driver's visual
  /// seat map and the passenger's seat picker.
  Future<SeatMap> seatMap(String rideId) async {
    final r = await api.get('/rides/$rideId/seatmap');
    return SeatMap.fromJson(r as Map<String, dynamic>);
  }

  /// Driver locks seats for passengers booking directly (offline).
  Future<void> lockSeats(String rideId, List<String> seatIds, {String? note}) async {
    await api.post('/rides/$rideId/seats/lock', {
      'seatIds': seatIds,
      if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
    });
  }

  /// Driver frees previously locked seats.
  Future<void> unlockSeats(String rideId, List<String> seatIds) async {
    await api.post('/rides/$rideId/seats/unlock', {'seatIds': seatIds});
  }

  Future<void> setCharterOptOut(String rideId, bool optOut) async {
    await api.post('/rides/$rideId/charter/opt-out', {'optOut': optOut});
  }
}
