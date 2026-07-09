class CharterStatus {
  final bool available;
  final bool optOut;
  final String? originLabel;
  final String? destLabel;
  final DateTime? nextPickupAt;
  final String? nextPickupLabel;

  CharterStatus({
    required this.available,
    required this.optOut,
    this.originLabel,
    this.destLabel,
    this.nextPickupAt,
    this.nextPickupLabel,
  });

  factory CharterStatus.fromJson(Map<String, dynamic> j) {
    final corridor = j['corridor'] as Map<String, dynamic>?;
    final at = j['nextPickupAt'] as String?;
    return CharterStatus(
      available: j['available'] as bool,
      optOut: (j['optOut'] as bool?) ?? false,
      originLabel: corridor?['origin'] as String?,
      destLabel: corridor?['dest'] as String?,
      nextPickupAt: at == null ? null : DateTime.parse(at),
      nextPickupLabel: j['nextPickupLabel'] as String?,
    );
  }
}

class CharterFeasibility {
  final bool feasible;
  final int? slackS;
  final DateTime? mustLeaveBy;
  final String? reason;

  CharterFeasibility({required this.feasible, this.slackS, this.mustLeaveBy, this.reason});

  factory CharterFeasibility.fromJson(Map<String, dynamic> j) {
    final mlb = j['mustLeaveBy'] as String?;
    return CharterFeasibility(
      feasible: j['feasible'] as bool,
      slackS: (j['slackS'] as num?)?.toInt(),
      mustLeaveBy: mlb == null ? null : DateTime.parse(mlb),
      reason: j['reason'] as String?,
    );
  }
}
