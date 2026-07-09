import 'itin_stop.dart';

class DynamicRoute {
  final int durationS;
  final double distanceKm;
  final List<ItinStop> stops;
  final List<List<double>> coordinates; // [lng, lat] pairs

  DynamicRoute({
    required this.durationS,
    required this.distanceKm,
    required this.stops,
    required this.coordinates,
  });

  factory DynamicRoute.fromJson(Map<String, dynamic> j) {
    final geom = j['geometry'] as Map<String, dynamic>?;
    final coords = (geom?['coordinates'] as List? ?? [])
        .map((c) => (c as List).map((n) => (n as num).toDouble()).toList())
        .toList();
    return DynamicRoute(
      durationS: (j['durationS'] as num).toInt(),
      distanceKm: (j['distanceKm'] as num).toDouble(),
      stops: (j['stops'] as List)
          .map((e) => ItinStop.fromJson(e as Map<String, dynamic>))
          .toList(),
      coordinates: coords,
    );
  }
}
