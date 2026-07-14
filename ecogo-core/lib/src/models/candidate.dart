import 'fare_quote.dart';

/// Driver-side detour metrics for a candidate ride (road distances).
class CandidateDetour {
  final int originalRemainingM;
  final int matchedRouteM;
  final int detourM;
  final double detourPct;
  final int? extraDurationS;

  const CandidateDetour({
    required this.originalRemainingM,
    required this.matchedRouteM,
    required this.detourM,
    required this.detourPct,
    required this.extraDurationS,
  });

  double get detourKm => detourM / 1000;

  factory CandidateDetour.fromJson(Map<String, dynamic> j) => CandidateDetour(
        originalRemainingM: (j['originalRemainingM'] as num).toInt(),
        matchedRouteM: (j['matchedRouteM'] as num).toInt(),
        detourM: (j['detourM'] as num).toInt(),
        detourPct: (j['detourPct'] as num).toDouble(),
        extraDurationS: (j['extraDurationS'] as num?)?.toInt(),
      );
}

class Candidate {
  final String rideId;
  final String? driverName;
  final double driverRating;
  final String? originLabel;
  final String? destLabel;
  final DateTime departureTime;
  final DateTime etaPickup;
  final int availableSeats;
  final int? pricePerSeat;
  final int pickupOffsetM;
  final int dropoffOffsetM;
  final double sharedKm;
  final bool eligible;
  final String? rankingReason;
  final String? exclusionReason;
  final CandidateDetour? detour;
  final FareQuote? fareQuote;

  Candidate({
    required this.rideId,
    required this.driverName,
    required this.driverRating,
    required this.originLabel,
    required this.destLabel,
    required this.departureTime,
    required this.etaPickup,
    required this.availableSeats,
    required this.pricePerSeat,
    required this.pickupOffsetM,
    required this.dropoffOffsetM,
    required this.sharedKm,
    this.eligible = true,
    this.rankingReason,
    this.exclusionReason,
    this.detour,
    this.fareQuote,
  });

  int get totalOffsetM => pickupOffsetM + dropoffOffsetM;

  factory Candidate.fromJson(Map<String, dynamic> j) => Candidate(
        rideId: j['rideId'] as String,
        driverName: j['driverName'] as String?,
        driverRating: (j['driverRating'] as num).toDouble(),
        originLabel: j['originLabel'] as String?,
        destLabel: j['destLabel'] as String?,
        departureTime: DateTime.parse(j['departureTime'] as String),
        etaPickup: DateTime.parse(j['etaPickup'] as String),
        availableSeats: j['availableSeats'] as int,
        pricePerSeat: (j['pricePerSeat'] as num?)?.toInt(),
        pickupOffsetM: (j['pickupOffsetM'] as num).toInt(),
        dropoffOffsetM: (j['dropoffOffsetM'] as num).toInt(),
        sharedKm: (j['sharedKm'] as num).toDouble(),
        eligible: j['eligible'] as bool? ?? true,
        rankingReason: j['rankingReason'] as String?,
        exclusionReason: j['exclusionReason'] as String?,
        detour: j['detour'] == null
            ? null
            : CandidateDetour.fromJson(j['detour'] as Map<String, dynamic>),
        fareQuote: j['fareQuote'] == null
            ? null
            : FareQuote.fromJson(j['fareQuote'] as Map<String, dynamic>),
      );
}
