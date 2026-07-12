class Booking {
  final String id;
  final String? rideId;
  final int seats;
  final int? fare;
  final String status;
  final String? originLabel;
  final String? destLabel;
  final String? pickupLabel;
  final String? dropoffLabel;
  final DateTime? departureTime;
  final String? driverName;
  final String? driverPhone;
  final int? myRating;
  final double? pickupLat;
  final double? pickupLng;
  final double? dropoffLat;
  final double? dropoffLng;

  Booking({
    required this.id,
    required this.rideId,
    required this.seats,
    required this.fare,
    required this.status,
    this.originLabel,
    this.destLabel,
    this.pickupLabel,
    this.dropoffLabel,
    this.departureTime,
    this.driverName,
    this.driverPhone,
    this.myRating,
    this.pickupLat,
    this.pickupLng,
    this.dropoffLat,
    this.dropoffLng,
  });

  factory Booking.fromJson(Map<String, dynamic> j) => Booking(
        id: j['id'] as String,
        rideId: j['ride_id'] as String?,
        seats: (j['seats'] as num).toInt(),
        fare: (j['fare'] as num?)?.toInt(),
        status: j['status'] as String,
        originLabel: j['origin_label'] as String?,
        destLabel: j['dest_label'] as String?,
        pickupLabel: j['pickup_label'] as String?,
        dropoffLabel: j['dropoff_label'] as String?,
        departureTime: j['departure_time'] == null
            ? null
            : DateTime.parse(j['departure_time'] as String),
        driverName: j['driver_name'] as String?,
        driverPhone: j['driver_phone'] as String?,
        myRating: (j['my_rating'] as num?)?.toInt(),
        pickupLat: (j['pickup_lat'] as num?)?.toDouble(),
        pickupLng: (j['pickup_lng'] as num?)?.toDouble(),
        dropoffLat: (j['dropoff_lat'] as num?)?.toDouble(),
        dropoffLng: (j['dropoff_lng'] as num?)?.toDouble(),
      );
}
