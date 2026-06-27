import 'dart:async';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:provider/provider.dart';
import '../models/ride.dart';
import '../models/ride_booking.dart';
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
  StreamSubscription<Position>? _sub;
  bool _sharing = false;

  @override
  void initState() {
    super.initState();
    _bookings = context.read<AppState>().rides.bookings(widget.ride.id);
  }

  void _reload() {
    setState(() {
      _bookings = context.read<AppState>().rides.bookings(widget.ride.id);
    });
  }

  Future<void> _toggleShare() async {
    final app = context.read<AppState>();
    if (_sharing) {
      await _sub?.cancel();
      setState(() => _sharing = false);
      return;
    }
    final ok = await app.location.ensurePermission();
    if (!ok) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Cần quyền vị trí')));
      return;
    }
    _sub = app.location.positionStream().listen((pos) {
      app.realtime.emitDriverLocation(widget.ride.id, pos.latitude, pos.longitude);
    });
    setState(() => _sharing = true);
  }

  Future<void> _confirm(RideBooking b) async {
    try {
      await context.read<AppState>().bookings.confirm(b.id);
      _reload();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.ride;
    return Scaffold(
      appBar: AppBar(title: Text('${r.originLabel ?? '—'} → ${r.destLabel ?? '—'}')),
      body: Column(
        children: [
          SwitchListTile(
            title: const Text('Chia sẻ vị trí trực tiếp'),
            subtitle: Text(_sharing ? 'Đang phát vị trí GPS' : 'Đang tắt'),
            value: _sharing,
            onChanged: (_) => _toggleShare(),
          ),
          const Divider(height: 1),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text('Khách trên chuyến', style: Theme.of(context).textTheme.titleMedium),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => _reload(),
              child: FutureBuilder<List<RideBooking>>(
                future: _bookings,
                builder: (context, snap) {
                  if (snap.connectionState != ConnectionState.done) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  final list = snap.data ?? [];
                  if (list.isEmpty) {
                    return ListView(children: const [
                      Padding(padding: EdgeInsets.all(24), child: Center(child: Text('Chưa có khách.'))),
                    ]);
                  }
                  return ListView.separated(
                    itemCount: list.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (_, i) {
                      final b = list[i];
                      return ListTile(
                        title: Text(b.passengerName ?? 'Khách'),
                        subtitle: Text(
                          '${b.pickupLabel ?? '—'} → ${b.dropoffLabel ?? '—'} · ${b.seats} ghế · ${b.status}',
                        ),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (b.status == 'matched')
                              TextButton(onPressed: () => _confirm(b), child: const Text('Xác nhận')),
                            IconButton(
                              icon: const Icon(Icons.chat_bubble_outline),
                              onPressed: () => Navigator.push(
                                context,
                                MaterialPageRoute(builder: (_) => ChatScreen(bookingId: b.id)),
                              ),
                            ),
                          ],
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
