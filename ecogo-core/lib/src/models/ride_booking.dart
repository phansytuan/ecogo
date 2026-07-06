class RideBooking {
  final String id;
  final String? passengerName;
  final String? pickupLabel;
  final String? dropoffLabel;
  final int seats;
  final int? fare;
  final String status;

  RideBooking({
    required this.id,
    required this.passengerName,
    required this.pickupLabel,
    required this.dropoffLabel,
    required this.seats,
    required this.fare,
    required this.status,
  });

  factory RideBooking.fromJson(Map<String, dynamic> j) => RideBooking(
        id: j['id'] as String,
        passengerName: j['passenger_name'] as String?,
        pickupLabel: j['pickup_label'] as String?,
        dropoffLabel: j['dropoff_label'] as String?,
        seats: (j['seats'] as num).toInt(),
        fare: (j['fare'] as num?)?.toInt(),
        status: j['status'] as String,
      );
}
