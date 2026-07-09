import 'dart:async';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:provider/provider.dart';
import 'package:ecogo_core/ecogo_core.dart';
import '../state/app_state.dart';
import 'chat_screen.dart';

class ActiveRideScreen extends StatefulWidget {
  final Ride ride;
  const ActiveRideScreen({super.key, required this.ride});
  @override
  State<ActiveRideScreen> createState() => _ActiveRideScreenState();
}

class _ActiveRideScreenState extends State<ActiveRideScreen> {
  late Future<List<RideBooking>> _bookings;
  late final RealtimeService _rt;
  StreamSubscription<Position>? _sub;
  bool _sharing = false;
  final Set<String> _confirming = {};

  @override
  void initState() {
    super.initState();
    _load();
    // Live-update the passenger list when someone books or cancels this ride.
    _rt = context.read<AppState>().realtime;
    _rt.joinRide(widget.ride.id);
    _rt.on('booking.matched', (_) {
      if (mounted) _load();
    });
    _rt.on('booking.cancelled', (_) {
      if (mounted) _load();
    });
  }

  void _load() {
    setState(() {
      _bookings = context.read<AppState>().rides.bookings(widget.ride.id);
    });
  }

  Future<void> _toggleShare(bool on) async {
    final app = context.read<AppState>();
    if (!on) {
      await _sub?.cancel();
      _sub = null;
      setState(() => _sharing = false);
      return;
    }
    final ok = await app.location.ensurePermission();
    if (!ok) {
      if (mounted) showSnack(context, 'Cần quyền vị trí để chia sẻ GPS', error: true);
      return;
    }
    _sub = app.location.positionStream().listen((pos) {
      app.realtime.emitDriverLocation(widget.ride.id, pos.latitude, pos.longitude);
    });
    setState(() => _sharing = true);
    if (mounted) showSnack(context, 'Đang chia sẻ vị trí trực tiếp');
  }

  Future<void> _confirm(RideBooking b) async {
    setState(() => _confirming.add(b.id));
    try {
      await context.read<AppState>().bookings.confirm(b.id);
      if (mounted) showSnack(context, 'Đã xác nhận khách');
      _load();
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.friendly, error: true);
    } catch (_) {
      if (mounted) showSnack(context, 'Xác nhận thất bại', error: true);
    } finally {
      if (mounted) setState(() => _confirming.remove(b.id));
    }
  }

  @override
  void dispose() {
    _sub?.cancel();
    _rt.off('booking.matched');
    _rt.off('booking.cancelled');
    super.dispose();
  }

  Future<void> _cancelRide() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Huỷ chuyến?'),
        content: const Text('Huỷ chuyến sẽ huỷ tất cả chỗ đã đặt. Bạn có chắc không?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Không')),
          FilledButton(
            style: FilledButton.styleFrom(
                minimumSize: const Size(0, 44), backgroundColor: const Color(0xFFC0392B)),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Huỷ chuyến'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await _sub?.cancel();
      await context.read<AppState>().rides.cancel(widget.ride.id);
      if (!mounted) return;
      showSnack(context, 'Đã huỷ chuyến');
      Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.friendly, error: true);
    } catch (_) {
      if (mounted) showSnack(context, 'Huỷ chuyến thất bại', error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.ride;
    return Scaffold(
      appBar: AppBar(
        title: Text('${r.originLabel ?? '—'} → ${r.destLabel ?? '—'}'),
        actions: [
          if (r.status == 'open' || r.status == 'full')
            IconButton(
              tooltip: 'Huỷ chuyến',
              icon: const Icon(Icons.cancel_outlined),
              onPressed: _cancelRide,
            ),
        ],
      ),
      body: Column(
        children: [
          // GPS share control
          Container(
            margin: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            decoration: BoxDecoration(
              color: _sharing ? const Color(0xFFD7EFE0) : Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.black.withOpacity(0.07)),
            ),
            // ClipRRect + transparent Material gives the ListTile a Material
            // ancestor to paint ink/splashes on (clipped to the rounded card).
            child: ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: Material(
                type: MaterialType.transparency,
                child: SwitchListTile(
                  value: _sharing,
                  onChanged: _toggleShare,
                  secondary: Icon(_sharing ? Icons.gps_fixed : Icons.gps_off,
                      color: _sharing ? ecogoGreen : Colors.black45),
                  title: const Text('Chia sẻ vị trí trực tiếp',
                      style: TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text(
                      _sharing ? 'Khách và điều phối thấy bạn theo thời gian thực' : 'Đang tắt'),
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text('Khách trên chuyến',
                  style: TextStyle(fontWeight: FontWeight.w700, color: Colors.black.withOpacity(0.7))),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => _load(),
              child: FutureBuilder<List<RideBooking>>(
                future: _bookings,
                builder: (context, snap) {
                  if (snap.connectionState != ConnectionState.done) {
                    return const LoadingView();
                  }
                  if (snap.hasError) {
                    final msg = snap.error is ApiException ? (snap.error as ApiException).friendly : 'Lỗi tải khách';
                    return ListView(children: [const SizedBox(height: 60), ErrorView(message: msg, onRetry: _load)]);
                  }
                  final list = snap.data ?? [];
                  if (list.isEmpty) {
                    return ListView(children: const [
                      SizedBox(height: 60),
                      EmptyState(icon: Icons.people_outline, message: 'Chưa có khách nào trên chuyến này.'),
                    ]);
                  }
                  return ListView.builder(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    itemCount: list.length,
                    itemBuilder: (_, i) {
                      final b = list[i];
                      final confirming = _confirming.contains(b.id);
                      return FadeInSlide(
                        delay: staggerDelay(i),
                        child: Card(
                          child: Padding(
                            padding: const EdgeInsets.all(14),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(b.passengerName ?? 'Khách',
                                          style: const TextStyle(fontWeight: FontWeight.w700)),
                                    ),
                                    StatusChip(b.status),
                                  ],
                                ),
                                const SizedBox(height: 6),
                                Text('${b.pickupLabel ?? '—'} → ${b.dropoffLabel ?? '—'} · ${b.seats} ghế',
                                    style: TextStyle(color: Colors.black.withOpacity(0.6), fontSize: 13)),
                                const SizedBox(height: 10),
                                Row(
                                  children: [
                                    if (b.status == 'matched')
                                      FilledButton(
                                        // Override the theme's full-width (Size.fromHeight)
                                        // minimum, which forces infinite width inside a Row.
                                        style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
                                        onPressed: confirming ? null : () => _confirm(b),
                                        child: confirming
                                            ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                            : const Text('Xác nhận'),
                                      ),
                                    const Spacer(),
                                    OutlinedButton.icon(
                                      onPressed: () => Navigator.push(
                                        context,
                                        MaterialPageRoute(builder: (_) => ChatScreen(bookingId: b.id)),
                                      ),
                                      icon: const Icon(Icons.chat_bubble_outline, size: 18),
                                      label: const Text('Nhắn'),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}
