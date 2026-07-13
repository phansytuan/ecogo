import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import 'package:ecogo_core/ecogo_core.dart';
import '../state/app_state.dart';
import 'trip_screen.dart';

/// Collects the precise pickup/dropoff points (tapped on the map) and, for
/// multi-seat bookings, the details of every additional passenger.
class BookingDetailsScreen extends StatefulWidget {
  final String rideId;
  final Stop pickupStop;
  final Stop dropoffStop;
  final int seats;
  final int? availableSeats;

  const BookingDetailsScreen({
    super.key,
    required this.rideId,
    required this.pickupStop,
    required this.dropoffStop,
    required this.seats,
    this.availableSeats,
  });

  @override
  State<BookingDetailsScreen> createState() => _BookingDetailsScreenState();
}

class _CompanionForm {
  final name = TextEditingController();
  final phone = TextEditingController();
  final email = TextEditingController();
  void dispose() {
    name.dispose();
    phone.dispose();
    email.dispose();
  }
}

class _BookingDetailsScreenState extends State<BookingDetailsScreen> {
  late LatLng _pickup;
  late LatLng _dropoff;
  final _pickupAddr = TextEditingController();
  final _dropoffAddr = TextEditingController();
  late int _seats;
  List<_CompanionForm> _companions = [];
  Future<SeatMap>? _seatMap;
  final Set<String> _pickedSeats = {};
  bool _editingPickup = true;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _pickup = LatLng(widget.pickupStop.lat, widget.pickupStop.lng);
    _dropoff = LatLng(widget.dropoffStop.lat, widget.dropoffStop.lng);
    // Never let the pre-selected seat count exceed what this ride actually has
    // free — otherwise the seat dropdown has a value with no matching item.
    final maxSeats = widget.availableSeats ?? 4;
    _seats = widget.seats.clamp(1, maxSeats < 1 ? 1 : maxSeats);
    _syncCompanions();
    _seatMap = context.read<AppState>().rides.seatMap(widget.rideId);
  }

  /// Keep exactly seats-1 companion forms — the account holder is passenger #1.
  void _syncCompanions() {
    final need = requiredCompanions(_seats);
    while (_companions.length < need) {
      _companions.add(_CompanionForm());
    }
    while (_companions.length > need) {
      _companions.removeLast().dispose();
    }
  }

  @override
  void dispose() {
    _pickupAddr.dispose();
    _dropoffAddr.dispose();
    for (final c in _companions) {
      c.dispose();
    }
    super.dispose();
  }

  String? _validate() {
    for (var i = 0; i < _companions.length; i++) {
      final c = _companions[i];
      final n = i + 2; // passenger number
      if (c.name.text.trim().length < 2) return 'Khách $n: cần họ tên';
      final phone = c.phone.text.trim();
      if (!RegExp(r'^(0|\+84)\d{9,10}$').hasMatch(phone)) {
        return 'Khách $n: số điện thoại không hợp lệ';
      }
      final email = c.email.text.trim();
      if (email.isNotEmpty && !RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email)) {
        return 'Khách $n: email không hợp lệ';
      }
    }
    return null;
  }

  Future<void> _book() async {
    final err = _validate();
    if (err != null) {
      showSnack(context, err, error: true);
      return;
    }
    if (_pickedSeats.isNotEmpty && _pickedSeats.length != _seats) {
      showSnack(context, 'Hãy chọn đúng $_seats ghế (hoặc bỏ chọn để hệ thống tự xếp)', error: true);
      return;
    }
    setState(() => _busy = true);
    try {
      final b = await context.read<AppState>().bookings.book(
            rideId: widget.rideId,
            pickup: Stop(widget.pickupStop.label, _pickup.latitude, _pickup.longitude),
            dropoff: Stop(widget.dropoffStop.label, _dropoff.latitude, _dropoff.longitude),
            seats: _seats,
            pickupAddress: _pickupAddr.text,
            dropoffAddress: _dropoffAddr.text,
            companions: _companions
                .map((c) => Companion(
                      fullName: c.name.text.trim(),
                      phone: c.phone.text.trim(),
                      email: c.email.text.trim().isEmpty ? null : c.email.text.trim(),
                    ))
                .toList(),
            seatIds: _pickedSeats.toList(),
          );
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => TripScreen(
            bookingId: b.id,
            rideId: widget.rideId,
            pickup: Stop(widget.pickupStop.label, _pickup.latitude, _pickup.longitude),
            dropoff: Stop(widget.dropoffStop.label, _dropoff.latitude, _dropoff.longitude),
          ),
        ),
      );
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.friendly, error: true);
    } catch (_) {
      if (mounted) showSnack(context, 'Đặt chỗ thất bại', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _toggleSeat(String seatId) {
    setState(() {
      if (_pickedSeats.contains(seatId)) {
        _pickedSeats.remove(seatId);
      } else {
        if (_pickedSeats.length >= _seats) {
          // Replace the oldest pick so the selection never exceeds the count.
          _pickedSeats.remove(_pickedSeats.first);
        }
        _pickedSeats.add(seatId);
      }
    });
  }

  Widget _seatPicker() {
    return FutureBuilder<SeatMap>(
      future: _seatMap,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done || !snap.hasData) {
          return const SizedBox.shrink();
        }
        final map = snap.data!;
        if (map.freeSeatIds.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 14),
            Text('Chọn ghế (không bắt buộc)', style: const TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 2),
            Text('Chọn đúng $_seats ghế, hoặc bỏ trống để hệ thống tự xếp.',
                style: TextStyle(fontSize: 12, color: Colors.black.withOpacity(0.55))),
            const SizedBox(height: 10),
            for (var i = 0; i < map.rows.length; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: map.rows[i].map((c) {
                    final selected = _pickedSeats.contains(c.seatId);
                    final selectable = c.status == 'free';
                    Color bg;
                    Color fg;
                    if (c.kind == 'driver') {
                      bg = const Color(0xFFE4E7EA);
                      fg = Colors.black45;
                    } else if (selected) {
                      bg = ecogoGreen;
                      fg = Colors.white;
                    } else if (c.status == 'free') {
                      bg = const Color(0xFFDDF0E5);
                      fg = const Color(0xFF1F6B45);
                    } else {
                      bg = const Color(0xFFEDEDED);
                      fg = Colors.black38;
                    }
                    return Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: Semantics(
                        label: 'Ghế ${c.seatId}${selectable ? ', trống' : ', không chọn được'}',
                        button: selectable,
                        selected: selected,
                        child: InkWell(
                          borderRadius: BorderRadius.circular(10),
                          onTap: selectable ? () => _toggleSeat(c.seatId) : null,
                          child: Container(
                            width: 46,
                            height: 46,
                            decoration: BoxDecoration(
                              color: bg,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: Colors.black.withOpacity(0.06)),
                            ),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(
                                    c.kind == 'driver'
                                        ? Icons.airline_seat_recline_normal
                                        : Icons.event_seat,
                                    size: 16,
                                    color: fg),
                                Text(c.kind == 'driver' ? 'TX' : c.seatId,
                                    style: TextStyle(fontSize: 8, color: fg, fontWeight: FontWeight.w600)),
                              ],
                            ),
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final maxSeats = (widget.availableSeats ?? 4).clamp(1, 9);
    return Scaffold(
      appBar: AppBar(title: const Text('Chi tiết đặt chỗ')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Chọn chính xác điểm đón và điểm trả trên bản đồ',
              style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          SegmentedButton<bool>(
            segments: const [
              ButtonSegment(value: true, label: Text('Điểm đón'), icon: Icon(Icons.trip_origin)),
              ButtonSegment(value: false, label: Text('Điểm trả'), icon: Icon(Icons.flag)),
            ],
            selected: {_editingPickup},
            onSelectionChanged: (v) => setState(() => _editingPickup = v.first),
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 260,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: FlutterMap(
                options: MapOptions(
                  initialCenter: _editingPickup ? _pickup : _dropoff,
                  initialZoom: 12,
                  onTap: (_, p) => setState(() {
                    if (_editingPickup) {
                      _pickup = p;
                    } else {
                      _dropoff = p;
                    }
                  }),
                ),
                children: [
                  TileLayer(
                    urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                    userAgentPackageName: 'vn.ecogo.passenger',
                  ),
                  MarkerLayer(markers: [
                    Marker(
                      point: _pickup,
                      width: 40,
                      height: 40,
                      child: const Icon(Icons.trip_origin, color: ecogoGreen, size: 30),
                    ),
                    Marker(
                      point: _dropoff,
                      width: 40,
                      height: 40,
                      child: const Icon(Icons.flag, color: Colors.red, size: 30),
                    ),
                  ]),
                ],
              ),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            _editingPickup
                ? 'Chạm bản đồ để đặt điểm đón · ${_pickup.latitude.toStringAsFixed(5)}, ${_pickup.longitude.toStringAsFixed(5)}'
                : 'Chạm bản đồ để đặt điểm trả · ${_dropoff.latitude.toStringAsFixed(5)}, ${_dropoff.longitude.toStringAsFixed(5)}',
            style: TextStyle(fontSize: 12, color: Colors.black.withOpacity(0.55)),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _pickupAddr,
            decoration: const InputDecoration(
              labelText: 'Địa chỉ đón chi tiết',
              hintText: 'VD: 15 Nguyễn Du, TP Vinh',
              prefixIcon: Icon(Icons.home_outlined),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _dropoffAddr,
            decoration: const InputDecoration(
              labelText: 'Địa chỉ trả chi tiết',
              hintText: 'VD: 30 Trần Hưng Đạo, Hà Nội',
              prefixIcon: Icon(Icons.place_outlined),
            ),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: const Color(0xFFFBF6EC),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(
              'Ở vùng sâu vùng xa hoặc ngõ nhỏ, tài xế có thể hẹn bạn ra điểm gần nhất.',
              style: TextStyle(fontSize: 12, color: Colors.black.withOpacity(0.7)),
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              const Text('Số ghế:', style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(width: 12),
              DropdownButton<int>(
                value: _seats,
                items: List.generate(maxSeats, (i) => i + 1)
                    .map((n) => DropdownMenuItem(value: n, child: Text('$n')))
                    .toList(),
                onChanged: _busy
                    ? null
                    : (v) => setState(() {
                          _seats = v ?? 1;
                          _syncCompanions();
                        }),
              ),
            ],
          ),
          _seatPicker(),
          if (_companions.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('Thông tin khách đi cùng (${_companions.length})',
                style: const TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text('Bắt buộc khi đặt từ 2 ghế trở lên.',
                style: TextStyle(fontSize: 12, color: Colors.black.withOpacity(0.55))),
            const SizedBox(height: 8),
            ...List.generate(_companions.length, (i) {
              final c = _companions[i];
              return FadeInSlide(
                delay: staggerDelay(i),
                child: Card(
                  margin: const EdgeInsets.symmetric(vertical: 6),
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Khách ${i + 2}',
                            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                        const SizedBox(height: 8),
                        TextField(
                          controller: c.name,
                          textCapitalization: TextCapitalization.words,
                          decoration: const InputDecoration(
                            labelText: 'Họ và tên *',
                            prefixIcon: Icon(Icons.person_outline),
                          ),
                        ),
                        const SizedBox(height: 10),
                        TextField(
                          controller: c.phone,
                          keyboardType: TextInputType.phone,
                          decoration: const InputDecoration(
                            labelText: 'Số điện thoại *',
                            prefixIcon: Icon(Icons.phone_outlined),
                          ),
                        ),
                        const SizedBox(height: 10),
                        TextField(
                          controller: c.email,
                          keyboardType: TextInputType.emailAddress,
                          decoration: const InputDecoration(
                            labelText: 'Email (nếu có)',
                            prefixIcon: Icon(Icons.mail_outline),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }),
          ],
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _busy ? null : _book,
            child: _busy
                ? const SizedBox(
                    width: 20, height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('Xác nhận đặt chỗ'),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}
