import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:ecogo_core/ecogo_core.dart';
import '../state/app_state.dart';
import 'trip_screen.dart';
import 'rate_trip_sheet.dart';

class MyTripsScreen extends StatefulWidget {
  const MyTripsScreen({super.key});
  @override
  State<MyTripsScreen> createState() => _MyTripsScreenState();
}

class _MyTripsScreenState extends State<MyTripsScreen> {
  late Future<List<Booking>> _trips;
  final Set<String> _cancelling = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    setState(() => _trips = context.read<AppState>().bookings.mine());
  }

  Future<void> _cancel(Booking b) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Huỷ chỗ?'),
        content: const Text('Bạn có chắc muốn huỷ chỗ này? Ghế sẽ được trả lại chuyến.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Quay lại')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Huỷ chỗ')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _cancelling.add(b.id));
    try {
      await context.read<AppState>().bookings.cancel(b.id);
      if (mounted) showSnack(context, 'Đã huỷ chỗ');
      _load();
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.friendly, error: true);
    } catch (_) {
      if (mounted) showSnack(context, 'Huỷ chỗ thất bại', error: true);
    } finally {
      if (mounted) setState(() => _cancelling.remove(b.id));
    }
  }

  bool _cancellable(Booking b) =>
      b.status == 'matched' || b.status == 'confirmed' || b.status == 'pending';

  bool _rateable(Booking b) =>
      (b.status == 'completed' || b.rideId != null && b.status == 'ongoing') && b.myRating == null;

  Future<void> _rate(Booking b) async {
    final score = await RateTripSheet.show(context,
        bookingId: b.id, driverName: b.driverName);
    if (score != null) _load(); // refresh so the trip shows its new rating
  }

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('dd/MM · HH:mm');
    return Scaffold(
      appBar: AppBar(title: const Text('Chuyến của tôi')),
      body: RefreshIndicator(
        onRefresh: () async => _load(),
        child: FutureBuilder<List<Booking>>(
          future: _trips,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const LoadingView();
            }
            if (snap.hasError) {
              final msg = snap.error is ApiException
                  ? (snap.error as ApiException).friendly
                  : 'Không tải được danh sách';
              return ListView(children: [const SizedBox(height: 120), ErrorView(message: msg, onRetry: _load)]);
            }
            final trips = snap.data ?? [];
            if (trips.isEmpty) {
              return ListView(children: const [
                SizedBox(height: 120),
                EmptyState(icon: Icons.confirmation_number_outlined, message: 'Bạn chưa có chuyến nào.'),
              ]);
            }
            return ListView.builder(
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: trips.length,
              itemBuilder: (_, i) {
                final b = trips[i];
                final busy = _cancelling.contains(b.id);
                return FadeInSlide(
                  delay: staggerDelay(i),
                  child: Card(
                    child: InkWell(
                      borderRadius: BorderRadius.circular(16),
                      onTap: (b.rideId == null || b.pickupLat == null)
                          ? null
                          : () => Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => TripScreen(
                                    bookingId: b.id,
                                    rideId: b.rideId!,
                                    pickup: Stop(b.pickupLabel ?? '',
                                        b.pickupLat ?? 0, b.pickupLng ?? 0),
                                    dropoff: Stop(b.dropoffLabel ?? '',
                                        b.dropoffLat ?? 0, b.dropoffLng ?? 0),
                                  ),
                                ),
                              ),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    '${b.pickupLabel ?? b.originLabel ?? '—'} → ${b.dropoffLabel ?? b.destLabel ?? '—'}',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                                  ),
                                ),
                                StatusChip(b.status),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                if (b.departureTime != null) ...[
                                  Icon(Icons.schedule, size: 15, color: Colors.black.withOpacity(0.45)),
                                  const SizedBox(width: 6),
                                  Text(fmt.format(b.departureTime!.toLocal()),
                                      style: TextStyle(color: Colors.black.withOpacity(0.6), fontSize: 13)),
                                  const SizedBox(width: 16),
                                ],
                                Icon(Icons.event_seat, size: 15, color: Colors.black.withOpacity(0.45)),
                                const SizedBox(width: 6),
                                Text('${b.seats} ghế', style: TextStyle(color: Colors.black.withOpacity(0.6), fontSize: 13)),
                                if (b.fare != null) ...[
                                  const SizedBox(width: 16),
                                  Text('${b.fare}đ',
                                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                                ],
                              ],
                            ),
                            if (b.driverName != null) ...[
                              const SizedBox(height: 6),
                              Text('Tài xế: ${b.driverName}${b.driverPhone != null ? ' · ${b.driverPhone}' : ''}',
                                  style: TextStyle(color: Colors.black.withOpacity(0.55), fontSize: 12)),
                            ],
                            if (b.myRating != null) ...[
                              const SizedBox(height: 8),
                              Row(
                                children: [
                                  Text('Bạn đã đánh giá: ',
                                      style: TextStyle(
                                          color: Colors.black.withOpacity(0.55), fontSize: 12)),
                                  ...List.generate(
                                      5,
                                      (i) => Icon(
                                            i < b.myRating! ? Icons.star_rounded : Icons.star_outline_rounded,
                                            size: 16,
                                            color: const Color(0xFFF2B01E),
                                          )),
                                ],
                              ),
                            ] else if (_rateable(b)) ...[
                              const SizedBox(height: 10),
                              Align(
                                alignment: Alignment.centerRight,
                                child: FilledButton.tonalIcon(
                                  onPressed: () => _rate(b),
                                  icon: const Icon(Icons.star_outline_rounded, size: 18),
                                  label: const Text('Đánh giá tài xế'),
                                ),
                              ),
                            ] else if (_cancellable(b)) ...[
                              const SizedBox(height: 10),
                              Align(
                                alignment: Alignment.centerRight,
                                child: OutlinedButton.icon(
                                  onPressed: busy ? null : () => _cancel(b),
                                  style: OutlinedButton.styleFrom(
                                    foregroundColor: const Color(0xFFB23B2E),
                                    side: const BorderSide(color: Color(0xFFB23B2E)),
                                  ),
                                  icon: busy
                                      ? const SizedBox(
                                          width: 14, height: 14,
                                          child: CircularProgressIndicator(strokeWidth: 2))
                                      : const Icon(Icons.close, size: 16),
                                  label: const Text('Huỷ chỗ'),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
