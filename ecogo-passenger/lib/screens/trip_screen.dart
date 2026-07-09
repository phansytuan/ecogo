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
  String _status = 'matched';
  late final RealtimeService _rt;

  @override
  void initState() {
    super.initState();
    final rt = context.read<AppState>().realtime;
    _rt = rt;
    rt.joinRide(widget.rideId);
    rt.onRideLocation((d) {
      if (!mounted) return;
      setState(() => _driver = LatLng((d['lat'] as num).toDouble(), (d['lng'] as num).toDouble()));
    });
    // Driver confirmed this booking.
    rt.on('booking.confirmed', (_) {
      if (!mounted) return;
      setState(() => _status = 'confirmed');
      showSnack(context, 'Tài xế đã xác nhận chuyến của bạn');
    });
    // Driver cancelled the whole ride — tell the passenger and leave the screen.
    rt.on('ride.cancelled', (_) {
      if (!mounted) return;
      showSnack(context, 'Tài xế đã huỷ chuyến này', error: true);
      Navigator.of(context).popUntil((r) => r.isFirst);
    });
  }

  @override
  void dispose() {
    _rt.off('ride:location');
    _rt.off('booking.confirmed');
    _rt.off('ride.cancelled');
    super.dispose();
  }

  Future<void> _cancel() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Huỷ chuyến?'),
        content: const Text('Bạn có chắc muốn huỷ đặt chỗ này không?'),
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
      await context.read<AppState>().bookings.cancel(widget.bookingId);
      if (!mounted) return;
      showSnack(context, 'Đã huỷ chuyến đi');
      Navigator.pop(context);
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.friendly, error: true);
    } catch (_) {
      if (mounted) showSnack(context, 'Huỷ chuyến thất bại', error: true);
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
            tooltip: 'Nhắn tài xế',
            icon: const Icon(Icons.chat_bubble_outline),
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => ChatScreen(bookingId: widget.bookingId)),
            ),
          ),
          IconButton(
            tooltip: 'Huỷ chuyến',
            icon: const Icon(Icons.cancel_outlined),
            onPressed: _cancel,
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
          _driver != null
              ? 'Tài xế đang di chuyển'
              : (_status == 'confirmed'
                  ? 'Tài xế đã xác nhận · đang chờ vị trí…'
                  : 'Đang chờ tài xế xác nhận…'),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }
}
