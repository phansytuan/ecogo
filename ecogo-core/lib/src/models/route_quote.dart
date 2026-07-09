class RouteQuote {
  final double km;
  final int durationS;
  final int pricePerSeat;

  RouteQuote({required this.km, required this.durationS, required this.pricePerSeat});

  factory RouteQuote.fromJson(Map<String, dynamic> j) => RouteQuote(
        km: (j['km'] as num).toDouble(),
        durationS: (j['durationS'] as num).toInt(),
        pricePerSeat: (j['pricePerSeat'] as num).toInt(),
      );
}
