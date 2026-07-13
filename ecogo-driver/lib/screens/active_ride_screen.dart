import 'dart:async';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:ecogo_core/ecogo_core.dart';
import '../state/app_state.dart';
import 'chat_screen.dart';
import '../widgets/seat_map_view.dart';

class ActiveRideScreen extends StatefulWidget {
  final Ride ride;
  const ActiveRideScreen({super.key, required this.ride});
  @override
  State<ActiveRideScreen> createState() => _ActiveRideScreenState();
}

class _ActiveRideScreenState extends State<ActiveRideScreen> {
  late Future<List<RideBooking>> _bookings;
  late Future<DynamicRoute> _route;
  late Future<CharterStatus> _charter;
  late Future<SeatMap> _seats;
  StreamSubscription<Position>? _sub;
  bool _sharing = false;
  bool _busy = false;
  final Set<String> _confirming = {};

  RealtimeService? _rt;

  @override
  void initState() {
    super.initState();
    _load();
    final rt = context.read<AppState>().realtime;
    _rt = rt;
    rt.joinRide(widget.ride.id);
    rt.onRideEvent((event, d) {
      if (!mounted) return;
      if (event == 'seatmap.updated') {
        final rides = context.read<AppState>().rides;
        setState(() => _seats = rides.seatMap(widget.ride.id));
      }
    });
  }

  void _load() {
    final rides = context.read<AppState>().rides;
    setState(() {
      _bookings = rides.bookings(widget.ride.id);
      _route = rides.dynamicRoute(widget.ride.id);
      _charter = rides.charterStatus(widget.ride.id);
      _seats = rides.seatMap(widget.ride.id);
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

  Future<bool> _confirmDialog(String title, String message, String action) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Quay lại')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(action)),
        ],
      ),
    );
    return ok ?? false;
  }

  Future<void> _completeRide() async {
    final ok = await _confirmDialog(
      'Hoàn thành chuyến?',
      'Chuyến sẽ được đánh dấu đã hoàn thành. Thời gian kết thúc thực tế được ghi lại '
          'để tính khoảng nghỉ trước chuyến kế tiếp.',
      'Hoàn thành',
    );
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    try {
      await context.read<AppState>().rides.complete(widget.ride.id);
      if (!mounted) return;
      showSnack(context, 'Đã hoàn thành chuyến');
      Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.friendly, error: true);
    } catch (_) {
      if (mounted) showSnack(context, 'Không hoàn thành được chuyến', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _cancelRide() async {
    final ok = await _confirmDialog(
      'Huỷ chuyến?',
      'Tất cả khách trên chuyến sẽ bị huỷ chỗ và được thông báo. Không thể hoàn tác.',
      'Huỷ chuyến',
    );
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    try {
      await context.read<AppState>().rides.cancel(widget.ride.id);
      if (!mounted) return;
      showSnack(context, 'Đã huỷ chuyến');
      Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.friendly, error: true);
    } catch (_) {
      if (mounted) showSnack(context, 'Không huỷ được chuyến', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _sub?.cancel();
    _rt?.off('ride:events');
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.ride;
    return Scaffold(
      appBar: AppBar(title: Text('${r.originLabel ?? '—'} → ${r.destLabel ?? '—'}')),
      body: RefreshIndicator(
        onRefresh: () async => _load(),
        child: ListView(
          padding: const EdgeInsets.symmetric(vertical: 8),
          children: [
            _gpsCard(),
            _seatMap(r),
            _charterCard(),
            _sectionTitle('Lộ trình đón / trả'),
            _itinerary(),
            _sectionTitle('Khách trên chuyến'),
            _passengers(),
            const SizedBox(height: 8),
            _actionBar(),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _sectionTitle(String t) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 14, 20, 6),
        child: Text(t, style: TextStyle(fontWeight: FontWeight.w700, color: Colors.black.withOpacity(0.7))),
      );

  Widget _actionBar() {
    final active = widget.ride.status == 'open' || widget.ride.status == 'full';
    if (!active) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Center(
          child: StatusChip(widget.ride.status),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          Expanded(
            child: OutlinedButton.icon(
              onPressed: _busy ? null : _cancelRide,
              style: OutlinedButton.styleFrom(
                foregroundColor: const Color(0xFFB23B2E),
                side: const BorderSide(color: Color(0xFFB23B2E)),
                minimumSize: const Size.fromHeight(48),
              ),
              icon: const Icon(Icons.close, size: 18),
              label: const Text('Huỷ chuyến'),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: FilledButton.icon(
              onPressed: _busy ? null : _completeRide,
              icon: _busy
                  ? const SizedBox(
                      width: 16, height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.check, size: 18),
              label: const Text('Hoàn thành'),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _setOptOut(bool optOut) async {
    try {
      await context.read<AppState>().rides.setCharterOptOut(widget.ride.id, optOut);
      if (!mounted) return;
      showSnack(context, optOut ? 'Đã tắt nhận bao chuyến' : 'Đã bật nhận bao chuyến');
      _load();
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.friendly, error: true);
    }
  }

  Widget _charterCard() {
    final fmt = DateFormat('HH:mm');
    return FutureBuilder<CharterStatus>(
      future: _charter,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done || !snap.hasData) {
          return const SizedBox.shrink();
        }
        final c = snap.data!;
        final on = c.available;
        return Container(
          margin: const EdgeInsets.fromLTRB(16, 8, 16, 4),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: on ? const Color(0xFFFBF6EC) : Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Colors.black.withOpacity(0.07)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.local_taxi_outlined,
                      color: on ? const Color(0xFF8A6D1A) : Colors.black38),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      on ? 'Đang mở nhận bao chuyến' : 'Không nhận bao chuyến',
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ),
                  Switch(
                    value: !c.optOut,
                    onChanged: (v) => _setOptOut(!v),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                c.nextPickupAt == null
                    ? 'Chưa có khách đặt ghế — xe được mở bao chuyến cùng tuyến.'
                    : 'Đã có khách. Bạn phải đón ${c.nextPickupLabel ?? 'khách'} '
                        'lúc ${fmt.format(c.nextPickupAt!.toLocal())}.',
                style: TextStyle(fontSize: 12, color: Colors.black.withOpacity(0.65)),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _gpsCard() {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 4, 16, 4),
      decoration: BoxDecoration(
        color: _sharing ? const Color(0xFFD7EFE0) : Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.black.withOpacity(0.07)),
      ),
      child: SwitchListTile(
        value: _sharing,
        onChanged: _toggleShare,
        secondary: Icon(_sharing ? Icons.gps_fixed : Icons.gps_off, color: _sharing ? ecogoGreen : Colors.black45),
        title: const Text('Chia sẻ vị trí trực tiếp', style: TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(_sharing ? 'Khách và điều phối thấy bạn theo thời gian thực' : 'Đang tắt'),
      ),
    );
  }

  Widget _seatMap(Ride r) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.black.withOpacity(0.07)),
      ),
      child: FutureBuilder<SeatMap>(
        future: _seats,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Padding(padding: EdgeInsets.all(8), child: LoadingView());
          }
          if (snap.hasError || !snap.hasData) {
            return Row(children: [
              const Expanded(child: Text('Không tải được sơ đồ ghế')),
              TextButton(onPressed: _load, child: const Text('Thử lại')),
            ]);
          }
          final map = snap.data!;
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text('Sơ đồ ghế',
                      style: TextStyle(
                          fontWeight: FontWeight.w600, color: Colors.black.withOpacity(0.75))),
                  const Spacer(),
                  Text('${map.freeCount} ghế trống',
                      style: TextStyle(fontSize: 12, color: Colors.black.withOpacity(0.6))),
                ],
              ),
              const SizedBox(height: 4),
              Text('Chạm ghế trống để giữ cho khách đặt trực tiếp; chạm ghế đã giữ để mở lại.',
                  style: TextStyle(fontSize: 11, color: Colors.black.withOpacity(0.5))),
              const SizedBox(height: 10),
              SeatMapView(map: map, onTapSeat: _busy ? null : (c) => _onTapSeat(c)),
            ],
          );
        },
      ),
    );
  }

  Future<void> _onTapSeat(SeatCell c) async {
    final rides = context.read<AppState>().rides;
    setState(() => _busy = true);
    try {
      if (c.status == 'free') {
        await rides.lockSeats(widget.ride.id, [c.seatId], note: 'Khách đặt trực tiếp');
        if (mounted) showSnack(context, 'Đã giữ ghế ${c.seatId}');
      } else if (c.status == 'locked') {
        await rides.unlockSeats(widget.ride.id, [c.seatId]);
        if (mounted) showSnack(context, 'Đã mở lại ghế ${c.seatId}');
      }
      if (mounted) setState(() => _seats = rides.seatMap(widget.ride.id));
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.friendly, error: true);
    } catch (_) {
      if (mounted) showSnack(context, 'Thao tác thất bại', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _itinerary() {
    final fmt = DateFormat('HH:mm');
    return FutureBuilder<DynamicRoute>(
      future: _route,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const Padding(padding: EdgeInsets.all(16), child: LoadingView());
        }
        if (snap.hasError) {
          final msg = snap.error is ApiException
              ? (snap.error as ApiException).friendly
              : 'Không tải được lộ trình';
          return ErrorView(message: msg, onRetry: _load);
        }
        final route = snap.data;
        if (route == null || route.stops.isEmpty) {
          return const EmptyState(icon: Icons.route_outlined, message: 'Chưa có lộ trình.');
        }
        final mins = (route.durationS / 60).round();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 6),
              child: Text(
                '≈ ${route.distanceKm.toStringAsFixed(0)} km · ${mins ~/ 60}h${(mins % 60).toString().padLeft(2, '0')} '
                '(cập nhật theo danh sách khách)',
                style: TextStyle(fontSize: 12, color: Colors.black.withOpacity(0.55)),
              ),
            ),
            ...route.stops.map((s) {
              return ListTile(
                dense: true,
                leading: Icon(_stopIcon(s.kind), color: _stopColor(s.kind)),
                title: Text(
                  s.label ?? _stopFallback(s.kind),
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                ),
                subtitle: s.passengerName != null ? Text(s.passengerName!) : null,
                trailing: Text(fmt.format(s.eta.toLocal()),
                    style: TextStyle(fontWeight: FontWeight.w600, color: Colors.black.withOpacity(0.7))),
              );
            }),
          ],
        );
      },
    );
  }

  IconData _stopIcon(String kind) {
    switch (kind) {
      case 'origin':
        return Icons.trip_origin;
      case 'pickup':
        return Icons.arrow_downward;
      case 'dropoff':
        return Icons.arrow_upward;
      default:
        return Icons.flag;
    }
  }

  Color _stopColor(String kind) {
    switch (kind) {
      case 'pickup':
        return ecogoGreen;
      case 'dropoff':
        return ecogoWarm;
      case 'dest':
        return Colors.red;
      default:
        return Colors.black54;
    }
  }

  String _stopFallback(String kind) {
    switch (kind) {
      case 'origin':
        return 'Điểm xuất phát';
      case 'dest':
        return 'Điểm kết thúc';
      case 'pickup':
        return 'Đón khách';
      default:
        return 'Trả khách';
    }
  }

  Widget _passengers() {
    return FutureBuilder<List<RideBooking>>(
      future: _bookings,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const Padding(padding: EdgeInsets.all(16), child: LoadingView());
        }
        if (snap.hasError) {
          final msg = snap.error is ApiException ? (snap.error as ApiException).friendly : 'Lỗi tải khách';
          return ErrorView(message: msg, onRetry: _load);
        }
        final list = snap.data ?? [];
        if (list.isEmpty) {
          return const EmptyState(icon: Icons.people_outline, message: 'Chưa có khách nào trên chuyến này.');
        }
        return Column(
          children: List.generate(list.length, (i) {
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
                          Expanded(child: Text(b.passengerName ?? 'Khách', style: const TextStyle(fontWeight: FontWeight.w700))),
                          StatusChip(b.status),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text('${b.pickupLabel ?? '—'} → ${b.dropoffLabel ?? '—'} · ${b.seats} ghế'
                          '${b.fare != null ? ' · ${b.fare}đ' : ''}',
                          style: TextStyle(color: Colors.black.withOpacity(0.6), fontSize: 13)),
                      if (b.pickupAddress != null || b.dropoffAddress != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          [
                            if (b.pickupAddress != null) 'Đón: ${b.pickupAddress}',
                            if (b.dropoffAddress != null) 'Trả: ${b.dropoffAddress}',
                          ].join('  ·  '),
                          style: TextStyle(color: Colors.black.withOpacity(0.5), fontSize: 12),
                        ),
                      ],
                      if (b.companions.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF3F6F4),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Khách đi cùng (${b.companions.length})',
                                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                              const SizedBox(height: 4),
                              ...b.companions.map((c) => Padding(
                                    padding: const EdgeInsets.symmetric(vertical: 2),
                                    child: Text('${c.fullName} · ${c.phone}',
                                        style: TextStyle(
                                            fontSize: 12, color: Colors.black.withOpacity(0.7))),
                                  )),
                            ],
                          ),
                        ),
                      ],
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          if (b.status == 'matched')
                            FilledButton(
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
          }),
        );
      },
    );
  }
}
