import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../models/ride.dart';
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

  void _reload() {
    setState(() => _rides = context.read<AppState>().rides.mine());
  }

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('dd/MM HH:mm');
    return Scaffold(
      appBar: AppBar(
        title: const Text('Chuyến của tôi'),
        actions: [
          IconButton(
            icon: const Icon(Icons.directions_car_filled),
            tooltip: 'Đăng ký xe',
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const VehicleScreen()),
            ),
          ),
          IconButton(
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
          if (ok == true) _reload();
        },
      ),
      body: RefreshIndicator(
        onRefresh: () async => _reload(),
        child: FutureBuilder<List<Ride>>(
          future: _rides,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snap.hasError) {
              return ListView(children: [Padding(padding: const EdgeInsets.all(24), child: Center(child: Text('Lỗi: ${snap.error}')))]);
            }
            final list = snap.data ?? [];
            if (list.isEmpty) {
              return ListView(children: const [
                Padding(padding: EdgeInsets.all(24), child: Center(child: Text('Chưa có chuyến nào. Đăng chuyến mới.'))),
              ]);
            }
            return ListView.separated(
              itemCount: list.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (_, i) {
                final r = list[i];
                return ListTile(
                  title: Text('${r.originLabel ?? '—'} → ${r.destLabel ?? '—'}'),
                  subtitle: Text(
                    '${fmt.format(r.departureTime.toLocal())} · còn ${r.availableSeats}/${r.totalSeats} ghế · ${r.status}',
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => ActiveRideScreen(ride: r)),
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
