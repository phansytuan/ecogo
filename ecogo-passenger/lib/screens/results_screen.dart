import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:ecogo_core/ecogo_core.dart';
import '../state/app_state.dart';
import 'booking_details_screen.dart';

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
  bool _requesting = false;
  bool _navigating = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    setState(() {
      _future = context.read<AppState>().matching.search(
            pickup: widget.pickup,
            dropoff: widget.dropoff,
            windowStart: widget.windowStart,
            windowEnd: widget.windowEnd,
            seats: widget.seats,
          );
    });
  }

  Future<void> _openDetails(Candidate c) async {
    if (_navigating) return;
    _navigating = true;
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => BookingDetailsScreen(
          rideId: c.rideId,
          pickupStop: widget.pickup,
          dropoffStop: widget.dropoff,
          seats: widget.seats,
          availableSeats: c.availableSeats,
          candidate: c,
        ),
      ),
    );
    _navigating = false;
  }

  Future<void> _createRequest() async {
    setState(() => _requesting = true);
    try {
      await context.read<AppState>().matching.createRequest(
            pickup: widget.pickup,
            dropoff: widget.dropoff,
            windowStart: widget.windowStart,
            windowEnd: widget.windowEnd,
            seats: widget.seats,
          );
      if (!mounted) return;
      showSnack(context, 'Đã gửi yêu cầu — hệ thống sẽ ghép hoặc chuyển điều phối viên.');
    } on ApiException catch (e) {
      if (!mounted) return;
      showSnack(context, e.friendly, error: true);
    } catch (_) {
      if (!mounted) return;
      showSnack(context, 'Gửi yêu cầu thất bại', error: true);
    } finally {
      if (mounted) setState(() => _requesting = false);
    }
  }

  String _formatOffset(int m) => m >= 1000 ? '${(m / 1000).toStringAsFixed(1)} km' : '$m m';

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('HH:mm');
    final dateFmt = DateFormat('dd/MM');
    return Scaffold(
      appBar: AppBar(title: Text('${widget.pickup.label} → ${widget.dropoff.label}')),
      body: RefreshIndicator(
        onRefresh: () async => _load(),
        child: FutureBuilder<List<Candidate>>(
          future: _future,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const LoadingView(label: 'Đang tìm chuyến ghép…');
            }
            if (snap.hasError) {
              final msg = snap.error is ApiException
                  ? (snap.error as ApiException).friendly
                  : 'Không tải được kết quả';
              return ErrorView(message: msg, onRetry: _load);
            }
            final list = snap.data ?? [];
            if (list.isEmpty) {
              return ListView(
                children: [
                  const SizedBox(height: 80),
                  EmptyState(
                    icon: Icons.search_off_rounded,
                    message: 'Chưa có chuyến phù hợp ngay lúc này.',
                    action: FilledButton.icon(
                      onPressed: _requesting ? null : _createRequest,
                      icon: _requesting
                          ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.add),
                      label: const Text('Tạo yêu cầu ghép'),
                    ),
                  ),
                ],
              );
            }
            return ListView.builder(
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: list.length,
              itemBuilder: (_, i) {
                final c = list[i];
                return FadeInSlide(
                  key: ValueKey(c.rideId),
                  delay: staggerDelay(i),
                  child: Card(
                    margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(16),
                      onTap: () => _openDetails(c),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                const CircleAvatar(radius: 18, child: Icon(Icons.person, size: 20)),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(c.driverName ?? 'Tài xế',
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(fontWeight: FontWeight.w600)),
                                      Text('★ ${c.driverRating.toStringAsFixed(1)}',
                                          style: const TextStyle(color: Color(0xFFC98A2B), fontSize: 12)),
                                    ],
                                  ),
                                ),
                                if (i == 0)
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFFD7EFE0),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: const Text('PHÙ HỢP NHẤT',
                                        style: TextStyle(
                                            color: Color(0xFF1F6B45), fontSize: 10, fontWeight: FontWeight.w700)),
                                  ),
                              ],
                            ),
                            const Divider(height: 16),
                            _row(Icons.play_circle_outline, 'Xuất phát',
                                '${dateFmt.format(c.departureTime.toLocal())} ${fmt.format(c.departureTime.toLocal())}'),
                            _row(Icons.my_location, 'Đón bạn',
                                '${fmt.format(c.etaPickup.toLocal())} (ước tính)'),
                            _row(Icons.alt_route, 'Lệch tuyến', _formatOffset(c.totalOffsetM)),
                            _row(Icons.route, 'Quãng đường chung', '${c.sharedKm.toStringAsFixed(1)} km'),
                            _row(Icons.event_seat, 'Còn ghế', '${c.availableSeats}'),
                            if (c.pricePerSeat != null)
                              _row(Icons.payments, 'Giá mỗi ghế', formatMoney(c.pricePerSeat!)),
                            const SizedBox(height: 12),
                            SizedBox(
                              width: double.infinity,
                              child: FilledButton(
                                onPressed: () => _openDetails(c),
                                child: const Text('Đặt chỗ'),
                              ),
                            ),
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

  Widget _row(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Icon(icon, size: 16, color: Colors.black.withValues(alpha: 0.4)),
          const SizedBox(width: 8),
          Text(label, style: TextStyle(color: Colors.black.withValues(alpha: 0.55), fontSize: 13)),
          const Spacer(),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
        ],
      ),
    );
  }
}
