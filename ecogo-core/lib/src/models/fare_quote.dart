/// Passenger fare quote (`POST /bookings/quote`): the fare basis is the
/// passenger's own road distance, never the driver's detour.
class FareQuote {
  final int routeDistanceM;
  final double routeDistanceKm;
  final int durationS;
  final int ratePerKm;
  final int farePerSeat;
  final int seats;
  final int totalFare;

  const FareQuote({
    required this.routeDistanceM,
    required this.routeDistanceKm,
    required this.durationS,
    required this.ratePerKm,
    required this.farePerSeat,
    required this.seats,
    required this.totalFare,
  });

  factory FareQuote.fromJson(Map<String, dynamic> j) => FareQuote(
        routeDistanceM: (j['routeDistanceM'] as num).toInt(),
        // The matching-search variant omits km/duration; derive/default them.
        routeDistanceKm: (j['routeDistanceKm'] as num?)?.toDouble() ??
            (j['routeDistanceM'] as num) / 1000.0,
        durationS: (j['durationS'] as num?)?.toInt() ?? 0,
        ratePerKm: (j['ratePerKm'] as num).toInt(),
        farePerSeat: (j['farePerSeat'] as num).toInt(),
        seats: (j['seats'] as num).toInt(),
        totalFare: (j['totalFare'] as num).toInt(),
      );
}
