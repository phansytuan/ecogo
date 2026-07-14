/// A suggestion from the backend address autocomplete (`GET /places/autocomplete`).
class PlaceSuggestion {
  final String placeId;
  final String description;

  const PlaceSuggestion({required this.placeId, required this.description});

  factory PlaceSuggestion.fromJson(Map<String, dynamic> j) => PlaceSuggestion(
        placeId: j['placeId'] as String,
        description: j['description'] as String,
      );
}

/// A resolved place: formatted address + the coordinates the backend will
/// actually route and match with.
class PlaceDetail {
  final String? placeId;
  final String address;
  final double lat;
  final double lng;

  const PlaceDetail({
    required this.placeId,
    required this.address,
    required this.lat,
    required this.lng,
  });

  factory PlaceDetail.fromJson(Map<String, dynamic> j) => PlaceDetail(
        placeId: j['placeId'] as String?,
        address: j['address'] as String,
        lat: (j['lat'] as num).toDouble(),
        lng: (j['lng'] as num).toDouble(),
      );
}
