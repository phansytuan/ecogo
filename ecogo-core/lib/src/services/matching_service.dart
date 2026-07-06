import '../models/candidate.dart';
import '../models/stop.dart';
import 'api_client.dart';

class MatchingService {
  final ApiClient api;
  MatchingService(this.api);

  Future<List<Candidate>> search({
    required Stop pickup,
    required Stop dropoff,
    required DateTime windowStart,
    required DateTime windowEnd,
    int seats = 1,
  }) async {
    final r = await api.post('/matching/search', {
      'pickup': {'lat': pickup.lat, 'lng': pickup.lng, 'label': pickup.label},
      'dropoff': {'lat': dropoff.lat, 'lng': dropoff.lng, 'label': dropoff.label},
      'windowStart': windowStart.toUtc().toIso8601String(),
      'windowEnd': windowEnd.toUtc().toIso8601String(),
      'seats': seats,
    });
    return (r as List).map((e) => Candidate.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<String> createRequest({
    required Stop pickup,
    required Stop dropoff,
    required DateTime windowStart,
    required DateTime windowEnd,
    int seats = 1,
  }) async {
    final r = await api.post('/requests', {
      'pickup': {'lat': pickup.lat, 'lng': pickup.lng, 'label': pickup.label},
      'dropoff': {'lat': dropoff.lat, 'lng': dropoff.lng, 'label': dropoff.label},
      'windowStart': windowStart.toUtc().toIso8601String(),
      'windowEnd': windowEnd.toUtc().toIso8601String(),
      'seats': seats,
    });
    return r['id'] as String;
  }
}
