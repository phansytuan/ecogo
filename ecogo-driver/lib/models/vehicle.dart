class Vehicle {
  final String id;
  final String type;
  final String plate;
  final int seats;
  final bool isEv;
  final String? model;

  Vehicle({
    required this.id,
    required this.type,
    required this.plate,
    required this.seats,
    required this.isEv,
    this.model,
  });

  factory Vehicle.fromJson(Map<String, dynamic> j) => Vehicle(
        id: j['id'] as String,
        type: j['type'] as String,
        plate: j['plate'] as String,
        seats: (j['seats'] as num).toInt(),
        isEv: (j['is_ev'] as bool?) ?? false,
        model: j['model'] as String?,
      );
}
