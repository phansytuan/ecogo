import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:intl/intl.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:ecogo_core/ecogo_core.dart';
import '../state/app_state.dart';
import 'chat_screen.dart';
import 'rate_trip_sheet.dart';

class TripScreen extends StatefulWidget {
  final String bookingId;
  final String rideId;
  final Stop pickup;
  final Stop dropoff;
  final String? initialStatus;
  final int? fare;
  final String? driverName;
  final String? driverPhone;
  final double? driverRating;
  final DateTime? departureTime;

  const TripScreen({
    super.key,
    required this.bookingId,
    required this.rideId,
    required this.pickup,
    required this.dropoff,
    this.initialStatus,
    this.fare,
    this.driverName,
    this.driverPhone,
    this.driverRating,
    this.departureTime,
  });

  @override
  State<TripScreen> createState() => _TripScreenState();
}

class _TripScreenState extends State<TripScreen> {
  LatLng? _driver;
  RealtimeService? _rt;
  final _map = MapController();
  String? _ended;
  bool _cancelling = false;
  bool _didFitBounds = false;
  bool _mapReady = false;
  bool _rated = false;

  bool get _hasCoords =>
      widget.pickup.lat != 0 || widget.pickup.lng != 0;

  @override
  void initState() {
    super.initState();
    if (widget.initialStatus == 'completed') {
      _ended = 'completed';
    } else if (widget.initialStatus == 'cancelled') {
      _ended = 'cancelled';
    }
    final rt = context.read<AppState>().realtime;
    _rt = rt;
    rt.joinRide(widget.rideId);
    rt.onRideLocation((d) {
      if (!mounted) return;
      final lat = (d['lat'] as num?)?.toDouble();
      final lng = (d['lng'] as num?)?.toDouble();
      if (lat == null || lng == null) return;
      setState(() => _driver = LatLng(lat, lng));
      _fitBoundsIfNeeded();
    });
    rt.onRideEvent((event, d) {
      if (!mounted) return;
      final evRide = d['rideId'] as String?;
      if (evRide != null && evRide != widget.rideId) return;
      if (event == 'ride.cancelled') {
        setState(() => _ended = 'cancelled');
      } else if (event == 'ride.completed') {
        setState(() => _ended = 'completed');
      } else if (event == 'booking.cancelled') {
        final evBooking = d['id'] as String?;
        if (evBooking == widget.bookingId) {
          setState(() => _ended = 'cancelled');
        }
      }
    });
  }

  void _fitBoundsIfNeeded() {
    if (_didFitBounds || !_hasCoords || !_mapReady) return;
    final points = <LatLng>[
      LatLng(widget.pickup.lat, widget.pickup.lng),
      LatLng(widget.dropoff.lat, widget.dropoff.lng),
      if (_driver != null) _driver!,
    ];
    if (points.length < 2) return;
    _didFitBounds = true;
    final bounds = LatLngBounds.fromPoints(points);
    _map.fitCamera(CameraFit.bounds(bounds: bounds, padding: const EdgeInsets.all(60)));
  }

  @override
  void dispose() {
    _rt?.off('ride:location');
    _rt?.off('ride:events');
    _rt?.leaveRide(widget.rideId);
    super.dispose();
  }

  Future<void> _cancelBooking() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Huỷ chỗ?'),
        content: const Text('Bạn có chắc muốn huỷ chỗ này?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Quay lại')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Huỷ chỗ')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _cancelling = true);
    try {
      await context.read<AppState>().bookings.cancel(widget.bookingId);
      if (!mounted) return;
      showSnack(context, 'Đã huỷ chỗ');
      Navigator.pop(context);
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.friendly, error: true);
    } catch (_) {
      if (mounted) showSnack(context, 'Huỷ chỗ thất bại', error: true);
    } finally {
      if (mounted) setState(() => _cancelling = false);
    }
  }

  Future<void> _callDriver() async {
    final phone = widget.driverPhone;
    if (phone == null || phone.isEmpty) return;
    final uri = Uri.parse('tel:$phone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  Future<void> _openRateSheet() async {
    final score = await RateTripSheet.show(context,
        bookingId: widget.bookingId, driverName: widget.driverName);
    if (score != null && mounted) {
      setState(() => _rated = true);
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
          if (_ended == null)
            IconButton(
              tooltip: 'Nhắn tài xế',
              icon: const Icon(Icons.chat_bubble_outline),
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => ChatScreen(bookingId: widget.bookingId)),
              ),
            ),
        ],
      ),
      body: Column(
        children: [
          if (_rt != null) ConnectionBanner(realtime: _rt!),
          if (_ended != null) _endedBanner(),
          _driverInfoCard(),
          Expanded(
            child: _hasCoords
                ? FlutterMap(
                    mapController: _map,
                    options: MapOptions(
                      initialCenter: pickup,
                      initialZoom: 9,
                      onMapReady: () {
                        _mapReady = true;
                        _fitBoundsIfNeeded();
                      },
                    ),
                    children: [
                      TileLayer(
                        urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                        userAgentPackageName: 'com.ecogo.passenger',
                      ),
                      MarkerLayer(
                        markers: [
                          Marker(
                              point: pickup, width: 40, height: 40,
                              child: const Icon(Icons.trip_origin, color: ecogoGreen, size: 30)),
                          Marker(
                              point: dropoff, width: 40, height: 40,
                              child: const Icon(Icons.place, color: Colors.red, size: 30)),
                          if (_driver != null)
                            Marker(
                                point: _driver!, width: 46, height: 46,
                                child: const Icon(Icons.directions_car, color: Colors.blue, size: 34)),
                        ],
                      ),
                    ],
                  )
                : const Center(
                    child: Padding(
                      padding: EdgeInsets.all(24),
                      child: Text('Bản đồ theo dõi sẽ hiển thị khi có toạ độ điểm đón.',
                          textAlign: TextAlign.center),
                    ),
                  ),
          ),
          _statusBar(),
        ],
      ),
    );
  }

  Widget _driverInfoCard() {
    final name = widget.driverName;
    final rating = widget.driverRating;
    final fare = widget.fare;
    final depTime = widget.departureTime;
    final fmt = DateFormat('HH:mm · dd/MM');
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.black.withValues(alpha: 0.07)),
      ),
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
                    Text(name ?? 'Tài xế',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                    if (rating != null)
                      Text('★ ${rating.toStringAsFixed(1)}',
                          style: const TextStyle(color: Color(0xFFC98A2B), fontSize: 12)),
                  ],
                ),
              ),
              if (_ended == null) ...[
                if (widget.driverPhone != null && widget.driverPhone!.isNotEmpty)
                  IconButton.outlined(
                    tooltip: 'Gọi tài xế',
                    icon: const Icon(Icons.phone_outlined, size: 20),
                    onPressed: _callDriver,
                  ),
                IconButton.outlined(
                  tooltip: 'Nhắn tin',
                  icon: const Icon(Icons.chat_bubble_outline, size: 20),
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => ChatScreen(bookingId: widget.bookingId)),
                  ),
                ),
              ],
            ],
          ),
          if (depTime != null || fare != null) ...[
            const Divider(height: 14),
            Row(
              children: [
                if (depTime != null) ...[
                  Icon(Icons.play_circle_outline, size: 16, color: Colors.black.withValues(alpha: 0.4)),
                  const SizedBox(width: 6),
                  Text('Xuất phát ${fmt.format(depTime.toLocal())}',
                      style: TextStyle(color: Colors.black.withValues(alpha: 0.6), fontSize: 13)),
                ],
                if (depTime != null && fare != null) const Spacer(),
                if (fare != null) ...[
                  Icon(Icons.payments, size: 16, color: Colors.black.withValues(alpha: 0.4)),
                  const SizedBox(width: 6),
                  Text(formatMoney(fare),
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: ecogoGreen)),
                ],
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _endedBanner() {
    final cancelled = _ended == 'cancelled';
    return Material(
      color: cancelled ? const Color(0xFFF7DDD8) : const Color(0xFFD7EFE0),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Icon(cancelled ? Icons.cancel_outlined : Icons.check_circle_outline,
                color: cancelled ? const Color(0xFFB23B2E) : const Color(0xFF1F6B45)),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                cancelled
                    ? 'Tài xế đã huỷ chuyến này. Bạn có thể tìm chuyến khác.'
                    : 'Chuyến đã hoàn thành. Cảm ơn bạn đã đi cùng ECOGO!',
                style: TextStyle(
                    color: cancelled ? const Color(0xFFB23B2E) : const Color(0xFF1F6B45),
                    fontWeight: FontWeight.w600),
              ),
            ),
            if (!cancelled && !_rated)
              TextButton(
                onPressed: _openRateSheet,
                child: const Text('Đánh giá'),
              ),
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('Đóng')),
          ],
        ),
      ),
    );
  }

  Widget _statusBar() {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Expanded(
              child: Text(
                _ended != null
                    ? (_ended == 'cancelled' ? 'Chuyến đã huỷ' : 'Chuyến đã hoàn thành')
                    : _driver == null
                        ? 'Đang chờ tài xế cập nhật vị trí…'
                        : 'Tài xế đang di chuyển',
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
            if (_ended == null)
              OutlinedButton.icon(
                onPressed: _cancelling ? null : _cancelBooking,
                style: OutlinedButton.styleFrom(
                  foregroundColor: const Color(0xFFB23B2E),
                  side: const BorderSide(color: Color(0xFFB23B2E)),
                ),
                icon: _cancelling
                    ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.close, size: 16),
                label: const Text('Huỷ chỗ'),
              ),
          ],
        ),
      ),
    );
  }
}
