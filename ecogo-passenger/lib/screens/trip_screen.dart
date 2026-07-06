import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import 'package:ecogo_core/ecogo_core.dart';
import '../state/app_state.dart';
import 'chat_screen.dart';

class TripScreen extends StatefulWidget {
  final String bookingId;
  final String rideId;
  final Stop pickup;
  final Stop dropoff;

  const TripScreen({
    super.key,
    required this.bookingId,
    required this.rideId,
    required this.pickup,
    required this.dropoff,
  });

  @override
  State<TripScreen> createState() => _TripScreenState();
}

class _TripScreenState extends State<TripScreen> {
  LatLng? _driver;

  @override
  void initState() {
    super.initState();
    final rt = context.read<AppState>().realtime;
    rt.joinRide(widget.rideId);
    rt.onRideLocation((d) {
      if (!mounted) return;
      setState(() => _driver = LatLng((d['lat'] as num).toDouble(), (d['lng'] as num).toDouble()));
    });
  }

  @override
  void dispose() {
    context.read<AppState>().realtime.off('ride:location');
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pickup = LatLng(widget.pickup.lat, widget.pickup.lng);
    final dropoff = LatLng(widget.dropoff.lat, widget.dropoff.lng);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Chuyến của bạn'),
        actions: [
          IconButton(
            icon: const Icon(Icons.chat_bubble_outline),
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => ChatScreen(bookingId: widget.bookingId)),
            ),
          ),
        ],
      ),
      body: FlutterMap(
        options: MapOptions(initialCenter: pickup, initialZoom: 8),
        children: [
          TileLayer(
            urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            userAgentPackageName: 'com.ecogo.passenger',
          ),
          MarkerLayer(
            markers: [
              Marker(point: pickup, width: 40, height: 40, child: const Icon(Icons.trip_origin, color: Colors.green)),
              Marker(point: dropoff, width: 40, height: 40, child: const Icon(Icons.place, color: Colors.red)),
              if (_driver != null)
                Marker(point: _driver!, width: 44, height: 44, child: const Icon(Icons.directions_car, color: Colors.blue)),
            ],
          ),
        ],
      ),
      bottomNavigationBar: Padding(
        padding: const EdgeInsets.all(12),
        child: Text(
          _driver == null ? 'Đang chờ tài xế cập nhật vị trí…' : 'Tài xế đang di chuyển',
          textAlign: TextAlign.center,
        ),
      ),
    );
  }
}
