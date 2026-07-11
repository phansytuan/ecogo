import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:ecogo_core/ecogo_core.dart';
import '../state/app_state.dart';
import 'active_ride_screen.dart';
import 'post_ride_screen.dart';
import 'vehicle_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late Future<List<Ride>> _rides;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() {
    final f = context.read<AppState>().rides.mine();
    // Block body: an arrow here would return the assigned Future, which
    // setState() rejects ("callback argument returned a Future").
    setState(() { _rides = f; });
    // Non-throwing so the pull-to-refresh spinner tracks the reload; the
    // FutureBuilder surfaces any error via ErrorView.
    return f.then((_) {}, onError: (_) {});
  }

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('dd/MM · HH:mm');
    return Scaffold(
      appBar: AppBar(
        title: const Text('Chuyến của tôi'),
        actions: [
          IconButton(
            tooltip: 'Đăng ký xe',
            icon: const Icon(Icons.directions_car_filled_outlined),
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const VehicleScreen()),
            ),
          ),
          IconButton(
            tooltip: 'Đăng xuất',
            icon: const Icon(Icons.logout),
            onPressed: () => context.read<AppState>().logout(),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        icon: const Icon(Icons.add),
        label: const Text('Đăng chuyến'),
        onPressed: () async {
          final ok = await Navigator.push<bool>(
            context,
            MaterialPageRoute(builder: (_) => const PostRideScreen()),
          );
          if (ok == true && mounted) _load();
        },
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: FutureBuilder<List<Ride>>(
          future: _rides,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const LoadingView();
            }
            if (snap.hasError) {
              final msg = snap.error is ApiException ? (snap.error as ApiException).friendly : 'Không tải được';
              return ListView(children: [const SizedBox(height: 120), ErrorView(message: msg, onRetry: _load)]);
            }
            final list = snap.data ?? [];
            if (list.isEmpty) {
              return ListView(children: const [
                SizedBox(height: 120),
                EmptyState(icon: Icons.route_outlined, message: 'Chưa có chuyến nào.\nĐăng chuyến đầu tiên của bạn.'),
              ]);
            }
            return ListView.builder(
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: list.length,
              itemBuilder: (_, i) {
                final r = list[i];
                return FadeInSlide(
                  delay: staggerDelay(i),
                  child: Card(
                    child: InkWell(
                      borderRadius: BorderRadius.circular(16),
                      onTap: () async {
                        final changed = await Navigator.push<bool>(
                          context,
                          MaterialPageRoute(builder: (_) => ActiveRideScreen(ride: r)),
                        );
                        if (changed == true && mounted) _load();
                      },
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text('${r.originLabel ?? '—'} → ${r.destLabel ?? '—'}',
                                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                                ),
                                StatusChip(r.status),
                              ],
                            ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                Icon(Icons.schedule, size: 15, color: Colors.black.withOpacity(0.45)),
                                const SizedBox(width: 6),
                                Text(fmt.format(r.departureTime.toLocal()),
                                    style: TextStyle(color: Colors.black.withOpacity(0.6), fontSize: 13)),
                                const SizedBox(width: 16),
                                Icon(Icons.event_seat, size: 15, color: Colors.black.withOpacity(0.45)),
                                const SizedBox(width: 6),
                                Text('${r.availableSeats}/${r.totalSeats} ghế',
                                    style: TextStyle(color: Colors.black.withOpacity(0.6), fontSize: 13)),
                                const Spacer(),
                                Icon(Icons.chevron_right, color: Colors.black.withOpacity(0.3)),
                              ],
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
}
