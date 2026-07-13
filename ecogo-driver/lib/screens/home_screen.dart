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
    _rides = context.read<AppState>().rides.mine();
  }

  void _load() {
    setState(() {
      _rides = context.read<AppState>().rides.mine();
    });
  }

  void _confirmLogout(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Đăng xuất?'),
        content: const Text('Bạn sẽ cần nhập lại mã OTP để đăng nhập lại. Vị trí trực tiếp sẽ ngừng chia sẻ.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Huỷ')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Đăng xuất')),
        ],
      ),
    );
    if (ok == true && context.mounted) {
      context.read<AppState>().logout();
    }
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
            onPressed: () => _confirmLogout(context),
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
        onRefresh: () async => _load(),
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
                                Icon(Icons.schedule, size: 15, color: Colors.black.withValues(alpha: 0.45)),
                                const SizedBox(width: 6),
                                Text(fmt.format(r.departureTime.toLocal()),
                                    style: TextStyle(color: Colors.black.withValues(alpha: 0.6), fontSize: 13)),
                                const SizedBox(width: 16),
                                Icon(Icons.event_seat, size: 15, color: Colors.black.withValues(alpha: 0.45)),
                                const SizedBox(width: 6),
                                Text('${r.availableSeats}/${r.totalSeats} ghế',
                                    style: TextStyle(color: Colors.black.withValues(alpha: 0.6), fontSize: 13)),
                                if (r.distanceM != null) ...[
                                  const SizedBox(width: 16),
                                  Icon(Icons.route, size: 15, color: Colors.black.withValues(alpha: 0.45)),
                                  const SizedBox(width: 6),
                                  Text('${(r.distanceM! / 1000).round()} km',
                                      style: TextStyle(color: Colors.black.withValues(alpha: 0.6), fontSize: 13)),
                                ],
                                const Spacer(),
                                Icon(Icons.chevron_right, color: Colors.black.withValues(alpha: 0.3)),
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
