import '../models/place.dart';
import 'api_client.dart';

/// Address search proxied through the ECOGO backend (never the map provider
/// directly): autocomplete, place detail, and reverse geocoding for GPS fixes.
class PlacesService {
  final ApiClient api;
  PlacesService(this.api);

  Future<List<PlaceSuggestion>> autocomplete(String input, {double? lat, double? lng}) async {
    final q = StringBuffer('/places/autocomplete?input=${Uri.encodeQueryComponent(input)}');
    if (lat != null && lng != null) q.write('&lat=$lat&lng=$lng');
    final r = await api.get(q.toString());
    return (r as List)
        .map((e) => PlaceSuggestion.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<PlaceDetail> detail(String placeId) async {
    final r = await api.get('/places/detail?placeId=${Uri.encodeQueryComponent(placeId)}');
    return PlaceDetail.fromJson(r as Map<String, dynamic>);
  }

  Future<PlaceDetail> reverse(double lat, double lng) async {
    final r = await api.get('/places/reverse?lat=$lat&lng=$lng');
    return PlaceDetail.fromJson(r as Map<String, dynamic>);
  }
}
