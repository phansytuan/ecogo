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
        availableSeats: (j['availableSeats'] as num).toInt(),
        pricePerSeat: (j['pricePerSeat'] as num?)?.toInt(),
        pickupOffsetM: (j['pickupOffsetM'] as num).toInt(),
        dropoffOffsetM: (j['dropoffOffsetM'] as num).toInt(),
        sharedKm: (j['sharedKm'] as num).toDouble(),
      );
}
