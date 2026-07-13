import 'companion.dart';

class RideBooking {
  final String id;
  final String? passengerName;
  final String? passengerPhone;
  final String? pickupLabel;
  final String? dropoffLabel;
  final String? pickupAddress;
  final String? dropoffAddress;
  final int seats;
  final int? fare;
  final String status;
  final List<Companion> companions;

  RideBooking({
    required this.id,
    required this.passengerName,
    required this.pickupLabel,
    required this.dropoffLabel,
    required this.seats,
    required this.fare,
    required this.status,
    this.passengerPhone,
    this.pickupAddress,
    this.dropoffAddress,
    this.companions = const [],
  });

  factory RideBooking.fromJson(Map<String, dynamic> j) => RideBooking(
        id: j['id'] as String,
        passengerName: j['passenger_name'] as String?,
        passengerPhone: j['passenger_phone'] as String?,
        pickupLabel: j['pickup_label'] as String?,
        dropoffLabel: j['dropoff_label'] as String?,
        pickupAddress: j['pickup_address'] as String?,
        dropoffAddress: j['dropoff_address'] as String?,
        seats: (j['seats'] as num).toInt(),
        fare: (j['fare'] as num?)?.toInt(),
        status: j['status'] as String,
        companions: ((j['companions'] as List?) ?? [])
            .map((e) => Companion.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}
