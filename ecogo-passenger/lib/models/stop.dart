class Stop {
  final String label;
  final double lat;
  final double lng;
  const Stop(this.label, this.lat, this.lng);
}

/// Corridor stops for the MVP route (Hà Tĩnh ... Bắc Giang).
/// Replace with Goong geocoding/autocomplete later.
const kStops = <Stop>[
  Stop('Hà Tĩnh', 18.3559, 105.8877),
  Stop('Vinh', 18.6790, 105.6810),
  Stop('Thanh Hóa', 19.8067, 105.7852),
  Stop('Ninh Bình', 20.2506, 105.9745),
  Stop('Hà Nội', 21.0278, 105.8342),
  Stop('Bắc Ninh', 21.1861, 106.0763),
  Stop('Bắc Giang', 21.2731, 106.1946),
];
