import 'package:flutter/foundation.dart';

@immutable
class Stop {
  final String label;
  final double lat;
  final double lng;
  /// Geocoding-provider reference when this stop came from an address search.
  final String? placeId;
  const Stop(this.label, this.lat, this.lng, {this.placeId});

  // Value equality so the same logical stop is interchangeable across widgets
  // (e.g. a DropdownButton value that came from a different code path).
  @override
  bool operator ==(Object other) =>
      other is Stop && other.label == label && other.lat == lat && other.lng == lng;

  @override
  int get hashCode => Object.hash(label, lat, lng);
}

/// Corridor stops for the MVP route (Hà Tĩnh ... Bắc Giang).
///
/// Coordinates are pickup/drop points that sit ON the shared inter-provincial
/// expressway, not the city centres. This matters because corridor matching
/// (`ST_DWithin`, strict tolerance 2 km) requires the search point to lie close
/// to a ride's route: the expressway bypasses city centres by 4–9 km, so
/// centre coordinates fail sub-segment matching for every intermediate town.
/// The three mid-corridor towns are snapped onto the expressway (≈0 m off both
/// the Vinh→Hà Nội and Hà Tĩnh→Bắc Giang route families, which converge there).
/// The four endpoints stay at their city centres, where rides actually
/// originate/terminate.
const kStops = <Stop>[
  Stop('Hà Tĩnh', 18.3559, 105.8877),
  Stop('Vinh', 18.6790, 105.6810),
  Stop('Thanh Hóa', 19.86162, 105.71999),
  Stop('Ninh Bình', 20.21955, 105.99860),
  Stop('Hà Nội', 21.0278, 105.8342),
  Stop('Bắc Ninh', 21.18079, 106.09319),
  Stop('Bắc Giang', 21.2731, 106.1946),
];
