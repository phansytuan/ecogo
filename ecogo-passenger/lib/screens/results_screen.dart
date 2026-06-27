import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../models/candidate.dart';
import '../models/stop.dart';
import '../state/app_state.dart';
import 'trip_screen.dart';

class ResultsScreen extends StatefulWidget {
  final Stop pickup;
  final Stop dropoff;
  final DateTime windowStart;
  final DateTime windowEnd;
  final int seats;

  const ResultsScreen({
    super.key,
    required this.pickup,
    required this.dropoff,
    required this.windowStart,
    required this.windowEnd,
    required this.seats,
  });

  @override
  State<ResultsScreen> createState() => _ResultsScreenState();
}

class _ResultsScreenState extends State<ResultsScreen> {
  late Future<List<Candidate>> _future;

  @override
  void initState() {
    super.initState();
    _future = context.read<AppState>().matching.search(
          pickup: widget.pickup,
          dropoff: widget.dropoff,
          windowStart: widget.windowStart,
          windowEnd: widget.windowEnd,
          seats: widget.seats,
        );
  }

  Future<void> _book(Candidate c) async {
    final app = context.read<AppState>();
    try {
      final booking = await app.bookings.book(
        rideId: c.rideId,
        pickup: widget.pickup,
        dropoff: widget.dropoff,
        seats: widget.seats,
      );
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => TripScreen(
            bookingId: booking.id,
            rideId: c.rideId,
            pickup: widget.pickup,
            dropoff: widget.dropoff,
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _createRequest() async {
    final app = context.read<AppState>();
    try {
      await app.matching.createRequest(
        pickup: widget.pickup,
        dropoff: widget.dropoff,
        windowStart: widget.windowStart,
        windowEnd: widget.windowEnd,
        seats: widget.seats,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã gửi yêu cầu. Hệ thống sẽ ghép hoặc chuyển điều phối viên.')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('HH:mm');
    return Scaffold(
      appBar: AppBar(title: Text('${widget.pickup.label} → ${widget.dropoff.label}')),
      body: FutureBuilder<List<Candidate>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return Center(child: Text('Lỗi: ${snap.error}'));
          }
          final list = snap.data ?? [];
          if (list.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('Chưa có chuyến phù hợp.'),
                  const SizedBox(height: 12),
                  FilledButton(onPressed: _createRequest, child: const Text('Tạo yêu cầu ghép')),
                ],
              ),
            );
          }
          return ListView.separated(
            itemCount: list.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (_, i) {
              final c = list[i];
              return ListTile(
                title: Text(c.driverName ?? 'Tài xế'),
                subtitle: Text(
                  'Đón ~${fmt.format(c.etaPickup.toLocal())} · lệch ${c.totalOffsetM} m · '
                  '${c.availableSeats} ghế'
                  '${c.pricePerSeat != null ? ' · ${c.pricePerSeat}đ' : ''}',
                ),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('★ ${c.driverRating.toStringAsFixed(1)}'),
                    const SizedBox(width: 8),
                    FilledButton(onPressed: () => _book(c), child: const Text('Đặt')),
                  ],
                ),
              );
            },
          );
        },
      ),
    );
  }
}
