class Booking {
  final String id;
  final String? rideId;
  final int seats;
  final int? fare;
  final String status;

  Booking({
    required this.id,
    required this.rideId,
    required this.seats,
    required this.fare,
    required this.status,
  });

  factory Booking.fromJson(Map<String, dynamic> j) => Booking(
        id: j['id'] as String,
        rideId: j['ride_id'] as String?,
        seats: (j['seats'] as num).toInt(),
        fare: (j['fare'] as num?)?.toInt(),
        status: j['status'] as String,
      );
}
