import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:ecogo_core/ecogo_core.dart';
import '../state/app_state.dart';
import 'vehicle_screen.dart';
import 'address_picker_screen.dart';

class PostRideScreen extends StatefulWidget {
  const PostRideScreen({super.key});
  @override
  State<PostRideScreen> createState() => _PostRideScreenState();
}

class _PostRideScreenState extends State<PostRideScreen> {
  late Future<List<Vehicle>> _vehicles;
  Vehicle? _vehicle;
  Stop? _origin;
  Stop? _dest;
  DateTime _departure = DateTime.now().add(const Duration(hours: 2));
  int _seats = 4;
  final _price = TextEditingController();
  RouteQuote? _quote;
  bool _quoting = false;
  bool _priceEdited = false;
  bool _busy = false;
  int _quoteRequest = 0;

  @override
  void initState() {
    super.initState();
    _vehicles = context.read<AppState>().vehicles.mine();
  }

  @override
  void dispose() {
    _price.dispose();
    super.dispose();
  }

  /// Seat options are capped by the selected vehicle's capacity.
  List<int> get _seatOptions {
    final max = _vehicle?.seats ?? 4;
    return [1, 2, 3, 4, 6, 7, 9, 16].where((n) => n <= max).toList();
  }

  void _onVehicleChanged(Vehicle? v) {
    setState(() {
      _vehicle = v;
      if (v != null && _seats > v.seats) _seats = v.seats;
    });
  }

  Future<void> _fetchQuote() async {
    final request = ++_quoteRequest;
    final origin = _origin;
    final dest = _dest;
    if (origin == null ||
        dest == null ||
        (origin.lat == dest.lat && origin.lng == dest.lng)) {
      setState(() {
        _quote = null;
        _quoting = false;
      });
      return;
    }
    setState(() => _quoting = true);
    try {
      final q = await context
          .read<AppState>()
          .rides
          .quote(origin: origin, dest: dest);
      if (!mounted || request != _quoteRequest) return;
      setState(() {
        _quote = q;
        if (!_priceEdited) _price.text = q.pricePerSeat.toString();
      });
    } catch (_) {
      // best-effort; leave the price as-is
    } finally {
      if (mounted && request == _quoteRequest) setState(() => _quoting = false);
    }
  }

  Future<void> _pickDateTime() async {
    final d = await showDatePicker(
      context: context,
      initialDate:
          _departure.isBefore(DateTime.now()) ? DateTime.now() : _departure,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 30)),
    );
    if (d == null || !mounted) return;
    final t = await showTimePicker(
        context: context, initialTime: TimeOfDay.fromDateTime(_departure));
    if (t == null || !mounted) return;
    final picked = DateTime(d.year, d.month, d.day, t.hour, t.minute);
    // The backend allows a small backdate window for drivers logging a trip
    // late; anything older is a data-entry mistake. Catch it here for a
    // friendlier message than a 400.
    if (picked.isBefore(DateTime.now().subtract(const Duration(minutes: 60)))) {
      showSnack(context, 'Giờ khởi hành không được quá 60 phút trước',
          error: true);
      return;
    }
    setState(() => _departure = picked);
  }

  Future<void> _post() async {
    if (_vehicle == null) {
      showSnack(context, 'Chọn xe trước', error: true);
      return;
    }
    if (_origin == null || _dest == null) {
      showSnack(context, 'Chọn đầy đủ điểm đi và điểm đến', error: true);
      return;
    }
    if (_quote == null || _quoting) {
      showSnack(context, 'Cần tính tuyến đường hợp lệ trước khi đăng',
          error: true);
      return;
    }
    if (_origin!.lat == _dest!.lat && _origin!.lng == _dest!.lng) {
      showSnack(context, 'Điểm đi/đến phải khác nhau', error: true);
      return;
    }
    if (_departure
        .isBefore(DateTime.now().subtract(const Duration(minutes: 60)))) {
      showSnack(context, 'Giờ khởi hành đã quá hạn — chọn lại', error: true);
      return;
    }
    final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
                title: const Text('Xác nhận tuyến đường'),
                content: Text(
                    '${_origin!.label}\n→ ${_dest!.label}\n\n${_quote!.km.toStringAsFixed(1)} km · ${(_quote!.durationS / 60).round()} phút\n$_seats ghế · ${DateFormat('dd/MM HH:mm').format(_departure)}'),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('Sửa lại')),
                  FilledButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('Xác nhận đăng'))
                ]));
    if (confirmed != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await context.read<AppState>().rides.post(
            vehicleId: _vehicle!.id,
            origin: _origin!,
            dest: _dest!,
            departureTime: _departure,
            totalSeats: _seats,
            pricePerSeat: int.tryParse(_price.text.trim()),
          );
      if (!mounted) return;
      showSnack(context, 'Đã đăng chuyến');
      Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (!mounted) return;
      showSnack(context, e.friendly, error: true);
    } catch (_) {
      if (!mounted) return;
      showSnack(context, 'Đăng chuyến thất bại', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('dd/MM · HH:mm');
    return Scaffold(
      appBar: AppBar(title: const Text('Đăng chuyến')),
      body: FutureBuilder<List<Vehicle>>(
        future: _vehicles,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const LoadingView();
          }
          if (snap.hasError) {
            final msg = snap.error is ApiException
                ? (snap.error as ApiException).friendly
                : 'Không tải được danh sách xe';
            return ErrorView(message: msg);
          }
          final list = snap.data ?? [];
          if (list.isEmpty) {
            return EmptyState(
              icon: Icons.directions_car_outlined,
              message: 'Bạn chưa đăng ký xe. Hãy đăng ký xe trước.',
              action: FilledButton(
                onPressed: () => Navigator.push<bool>(
                  context,
                  MaterialPageRoute(builder: (_) => const VehicleScreen()),
                ).then((ok) {
                  if (ok == true && mounted) {
                    setState(() =>
                        _vehicles = context.read<AppState>().vehicles.mine());
                  }
                }),
                child: const Text('Đăng ký xe'),
              ),
            );
          }
          _vehicle ??= list.first;
          final seats = _seatOptions;
          if (!seats.contains(_seats)) {
            _seats = seats.isEmpty ? 1 : seats.last;
          }
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              DropdownButtonFormField<Vehicle>(
                initialValue: _vehicle,
                decoration: const InputDecoration(labelText: 'Xe'),
                items: list
                    .map((v) => DropdownMenuItem(
                        value: v, child: Text('${v.plate} · ${v.seats} ghế')))
                    .toList(),
                onChanged: _onVehicleChanged,
              ),
              const SizedBox(height: 12),
              _stop('Điểm đi', _origin, (s) {
                setState(() => _origin = s);
                _fetchQuote();
              }),
              const SizedBox(height: 12),
              _stop('Điểm đến', _dest, (s) {
                setState(() => _dest = s);
                _fetchQuote();
              }),
              const SizedBox(height: 12),
              _quoteCard(),
              const SizedBox(height: 12),
              ListTile(
                shape: RoundedRectangleBorder(
                  side: BorderSide(color: Colors.black.withValues(alpha: 0.12)),
                  borderRadius: BorderRadius.circular(12),
                ),
                title: const Text('Giờ khởi hành'),
                subtitle: Text(fmt.format(_departure)),
                trailing: const Icon(Icons.edit_calendar),
                onTap: _pickDateTime,
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  const Text('Số ghế bán:'),
                  const SizedBox(width: 12),
                  DropdownButton<int>(
                    value: _seats,
                    items: seats
                        .map((n) =>
                            DropdownMenuItem(value: n, child: Text('$n')))
                        .toList(),
                    onChanged: _busy
                        ? null
                        : (v) => setState(() => _seats = v ?? _seats),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _price,
                keyboardType: TextInputType.number,
                onChanged: (_) => _priceEdited = true,
                decoration: const InputDecoration(
                  labelText: 'Giá mỗi ghế (đ)',
                  helperText:
                      'Tự động tính theo quãng đường — bạn có thể chỉnh.',
                ),
              ),
              const SizedBox(height: 12),
              _note(),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _busy ? null : _post,
                child: _busy
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white))
                    : const Text('Đăng chuyến'),
              ),
              const SizedBox(height: 24),
            ],
          );
        },
      ),
    );
  }

  Widget _quoteCard() {
    final money = NumberFormat.decimalPattern('vi');
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
          color: const Color(0xFFEAF4EE),
          borderRadius: BorderRadius.circular(12)),
      child: Row(
        children: [
          const Icon(Icons.route, color: ecogoGreen),
          const SizedBox(width: 10),
          Expanded(
            child: _quoting
                ? const Text('Đang tính quãng đường & giá gợi ý…')
                : _quote == null
                    ? const Text('Chọn điểm đi/đến để tính giá gợi ý')
                    : Text(
                        '≈ ${_quote!.km.toStringAsFixed(0)} km · gợi ý '
                        '${money.format(_quote!.pricePerSeat)}đ/ghế (chặng đầy đủ)',
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
          ),
          if (_quoting)
            const SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(strokeWidth: 2)),
        ],
      ),
    );
  }

  Widget _note() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
          color: const Color(0xFFFBF6EC),
          borderRadius: BorderRadius.circular(12)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _noteLine(Icons.info_outline,
              'Khách trả tiền theo quãng đường thực tế của họ. Ở vùng sâu vùng xa hoặc ngõ nhỏ đông đúc, bạn có thể không đón/trả tận nơi.'),
          const SizedBox(height: 8),
          _noteLine(Icons.local_taxi_outlined,
              'Khi chưa có khách đặt, xe được mở nhận bao chuyến cùng tuyến — miễn là bạn vẫn kịp đón khách theo lịch.'),
        ],
      ),
    );
  }

  Widget _noteLine(IconData icon, String text) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: const Color(0xFF8A6D1A)),
        const SizedBox(width: 8),
        Expanded(
          child: Text(text,
              style: TextStyle(
                  fontSize: 12, color: Colors.black.withValues(alpha: 0.7))),
        ),
      ],
    );
  }

  Widget _stop(String label, Stop? value, ValueChanged<Stop> onChanged) {
    return ListTile(
        shape: RoundedRectangleBorder(
            side: BorderSide(color: Colors.black.withValues(alpha: .12)),
            borderRadius: BorderRadius.circular(12)),
        title: Text(label),
        subtitle: Text(value?.label ?? 'Chọn địa chỉ chi tiết'),
        leading: Icon(
            value == null ? Icons.location_on_outlined : Icons.location_on),
        trailing: Row(mainAxisSize: MainAxisSize.min, children: [
          if (value != null)
            IconButton(
                icon: const Icon(Icons.clear),
                onPressed: _busy
                    ? null
                    : () {
                        setState(() {
                          if (label == 'Điểm đi')
                            _origin = null;
                          else
                            _dest = null;
                          _quote = null;
                        });
                      }),
          const Icon(Icons.chevron_right)
        ]),
        onTap: _busy
            ? null
            : () async {
                final s = await Navigator.push<Stop>(
                    context,
                    MaterialPageRoute(
                        builder: (_) =>
                            AddressPickerScreen(title: 'Chọn $label')));
                if (s != null && mounted) onChanged(s);
              });
  }
}
