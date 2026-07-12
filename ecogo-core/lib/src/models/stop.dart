class Stop {
  final String label;
  final double lat;
  final double lng;
  const Stop(this.label, this.lat, this.lng);
}

/// Corridor stops for the MVP route (Hà Tĩnh ... Bắc Giang).
///
/// Coordinates are snapped onto the actual North–South highway/expressway that
/// the Goong directions provider routes along (via ST_ClosestPoint on a real
/// Hà Tĩnh→Bắc Giang route). City-center coordinates sit 4–9 km off that road,
/// which put intermediate pickups outside the corridor-match tolerance (strict
/// 2 km) and made sub-segment searches return nothing. On-road coordinates keep
/// every stop within tolerance so corridor matching finds rides at any stop.
const kStops = <Stop>[
  Stop('Hà Tĩnh', 18.355955, 105.887765),
  Stop('Vinh', 18.679703, 105.617899),
  Stop('Thanh Hóa', 19.861616, 105.719988),
  Stop('Ninh Bình', 20.219550, 105.998600),
  Stop('Hà Nội', 20.965560, 105.848990),
  Stop('Bắc Ninh', 21.180789, 106.093193),
  Stop('Bắc Giang', 21.273100, 106.194600),
];
