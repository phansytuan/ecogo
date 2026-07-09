class ItinStop {
  final String kind; // origin | pickup | dropoff | dest
  final double? fraction;
  final String? label;
  final String? passengerName;
  final DateTime eta;

  ItinStop({
    required this.kind,
    required this.eta,
    this.fraction,
    this.label,
    this.passengerName,
  });

  factory ItinStop.fromJson(Map<String, dynamic> j) => ItinStop(
        kind: j['kind'] as String,
        fraction: (j['fraction'] as num?)?.toDouble(),
        label: j['label'] as String?,
        passengerName: j['passengerName'] as String?,
        eta: DateTime.parse(j['eta'] as String),
      );
}
