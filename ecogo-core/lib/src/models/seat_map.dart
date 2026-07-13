class SeatCell {
  final String seatId;
  final int row;
  final int col;
  final String kind; // driver | passenger
  final String status; // free | locked | booked | driver | unavailable
  final String? note;

  SeatCell({
    required this.seatId,
    required this.row,
    required this.col,
    required this.kind,
    required this.status,
    this.note,
  });

  bool get isFree => status == 'free';
  bool get isSelectable => status == 'free';

  factory SeatCell.fromJson(Map<String, dynamic> j) => SeatCell(
        seatId: j['seatId'] as String,
        row: (j['row'] as num).toInt(),
        col: (j['col'] as num).toInt(),
        kind: j['kind'] as String,
        status: j['status'] as String,
        note: j['note'] as String?,
      );
}

class SeatMap {
  final String rideId;
  final String vehicleType;
  final List<List<SeatCell>> rows;
  final List<String> freeSeatIds;

  SeatMap({
    required this.rideId,
    required this.vehicleType,
    required this.rows,
    required this.freeSeatIds,
  });

  int get freeCount => freeSeatIds.length;

  factory SeatMap.fromJson(Map<String, dynamic> j) => SeatMap(
        rideId: j['rideId'] as String,
        vehicleType: j['vehicleType'] as String,
        rows: (j['rows'] as List)
            .map((r) => (r as List)
                .map((c) => SeatCell.fromJson(c as Map<String, dynamic>))
                .toList())
            .toList(),
        freeSeatIds:
            (j['freeSeatIds'] as List).map((e) => e as String).toList(),
      );
}
