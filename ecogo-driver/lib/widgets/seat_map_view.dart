import 'package:flutter/material.dart';
import 'package:ecogo_core/ecogo_core.dart';

/// A visual seat map mirroring the real vehicle layout (Row 1, Row 2, ...).
/// Tapping a seat invokes [onTapSeat]; colours reflect status.
class SeatMapView extends StatelessWidget {
  final SeatMap map;
  final void Function(SeatCell)? onTapSeat;
  final Set<String> selected;

  const SeatMapView({
    super.key,
    required this.map,
    this.onTapSeat,
    this.selected = const {},
  });

  Color _bg(SeatCell c) {
    if (selected.contains(c.seatId)) return const Color(0xFF2D6A4F);
    switch (c.status) {
      case 'driver':
        return const Color(0xFFE4E7EA);
      case 'free':
        return const Color(0xFFDDF0E5);
      case 'locked':
        return const Color(0xFFFBECC9);
      case 'booked':
        return const Color(0xFFF6D8D3);
      default:
        return const Color(0xFFEDEDED);
    }
  }

  Color _fg(SeatCell c) {
    if (selected.contains(c.seatId)) return Colors.white;
    switch (c.status) {
      case 'free':
        return const Color(0xFF1F6B45);
      case 'locked':
        return const Color(0xFF8A6D1A);
      case 'booked':
        return const Color(0xFFB23B2E);
      default:
        return Colors.black45;
    }
  }

  IconData _icon(SeatCell c) {
    switch (c.status) {
      case 'driver':
        return Icons.airline_seat_recline_normal;
      case 'locked':
        return Icons.lock;
      case 'booked':
        return Icons.person;
      default:
        return Icons.event_seat;
    }
  }

  String _statusLabel(String s) {
    switch (s) {
      case 'free':
        return 'trống';
      case 'locked':
        return 'đã giữ';
      case 'booked':
        return 'đã đặt';
      case 'driver':
        return 'tài xế';
      default:
        return s;
    }
  }

  Widget _legend(Color color, String label) {
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Container(
        width: 14,
        height: 14,
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(4)),
      ),
      const SizedBox(width: 5),
      Text(label, style: const TextStyle(fontSize: 11)),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < map.rows.length; i++) ...[
          Padding(
            padding: const EdgeInsets.only(bottom: 4, top: 4),
            child: Text('Hàng ${i + 1}',
                style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: Colors.black.withValues(alpha: 0.4))),
          ),
          Row(
            children: map.rows[i].map((c) {
              final tappable = c.kind == 'passenger' &&
                  (c.status == 'free' || c.status == 'locked') &&
                  onTapSeat != null;
              return Padding(
                padding: const EdgeInsets.only(right: 8, bottom: 8),
                child: Semantics(
                  label: 'Ghế ${c.seatId}, ${_statusLabel(c.status)}',
                  button: tappable,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(10),
                    onTap: tappable ? () => onTapSeat!(c) : null,
                    child: Container(
                      width: 52,
                      height: 52,
                      decoration: BoxDecoration(
                        color: _bg(c),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(_icon(c), size: 18, color: _fg(c)),
                          const SizedBox(height: 2),
                          Text(
                            c.kind == 'driver' ? 'TX' : c.seatId,
                            style: TextStyle(
                                fontSize: 9, fontWeight: FontWeight.w600, color: _fg(c)),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        ],
        const SizedBox(height: 6),
        Wrap(spacing: 14, runSpacing: 6, children: [
          _legend(const Color(0xFFDDF0E5), 'Trống'),
          _legend(const Color(0xFFFBECC9), 'Đã giữ (khách trực tiếp)'),
          _legend(const Color(0xFFF6D8D3), 'Đã đặt online'),
        ]),
      ],
    );
  }
}
