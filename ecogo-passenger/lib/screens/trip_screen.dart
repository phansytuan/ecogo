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
  late final AppState _app;
  LatLng? _driver;
  bool _cancelling = false;

  @override
  void initState() {
    super.initState();
    // Capture AppState now; reading context in dispose() is unsafe.
    _app = context.read<AppState>();
    _app.realtime.joinRide(widget.rideId);
    _app.realtime.onRideLocation((d) {
      if (!mounted) return;
      setState(() => _driver = LatLng((d['lat'] as num).toDouble(), (d['lng'] as num).toDouble()));
    });
  }

  @override
  void dispose() {
    _app.realtime.off('ride:location');
    super.dispose();
  }

  Future<void> _cancel() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Hủy chuyến?'),
        content: const Text('Bạn có chắc muốn hủy đặt chỗ này?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Không')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Hủy chuyến')),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _cancelling = true);
    try {
      await _app.bookings.cancel(widget.bookingId);
      if (!mounted) return;
      showSnack(context, 'Đã hủy chuyến.');
      Navigator.of(context).popUntil((r) => r.isFirst);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _cancelling = false);
      showSnack(context, e.friendly, error: true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _cancelling = false);
      showSnack(context, 'Hủy chuyến thất bại', error: true);
    }
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
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                _driver == null ? 'Đang chờ tài xế cập nhật vị trí…' : 'Tài xế đang di chuyển',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: _cancelling ? null : _cancel,
                  icon: _cancelling
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.cancel_outlined),
                  label: const Text('Hủy chuyến'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
