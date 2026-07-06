class Ride {
  final String id;
  final String? originLabel;
  final String? destLabel;
  final DateTime departureTime;
  final int availableSeats;
  final int totalSeats;
  final int? pricePerSeat;
  final String status;

  Ride({
    required this.id,
    required this.originLabel,
    required this.destLabel,
    required this.departureTime,
    required this.availableSeats,
    required this.totalSeats,
    required this.pricePerSeat,
    required this.status,
  });

  factory Ride.fromJson(Map<String, dynamic> j) => Ride(
        id: j['id'] as String,
        originLabel: j['origin_label'] as String?,
        destLabel: j['dest_label'] as String?,
        departureTime: DateTime.parse(j['departure_time'] as String),
        availableSeats: (j['available_seats'] as num).toInt(),
        totalSeats: (j['total_seats'] as num).toInt(),
        pricePerSeat: (j['price_per_seat'] as num?)?.toInt(),
        status: j['status'] as String,
      );
}
