import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:ecogo_core/ecogo_core.dart';
import '../state/app_state.dart';

class PostRideScreen extends StatefulWidget {
  const PostRideScreen({super.key});
  @override
  State<PostRideScreen> createState() => _PostRideScreenState();
}

class _PostRideScreenState extends State<PostRideScreen> {
  late Future<List<Vehicle>> _vehicles;
  Vehicle? _vehicle;
  Stop _origin = kStops.first;
  Stop _dest = kStops.last;
  DateTime _departure = DateTime.now().add(const Duration(hours: 2));
  int _seats = 4;
  final _price = TextEditingController();
  RouteQuote? _quote;
  bool _quoting = false;
  bool _priceEdited = false;
  bool _posting = false;

  @override
  void initState() {
    super.initState();
    _vehicles = context.read<AppState>().vehicles.mine();
    _fetchQuote();
  }

  Future<void> _fetchQuote() async {
    if (_origin.label == _dest.label) return;
    setState(() => _quoting = true);
    try {
      final q = await context.read<AppState>().rides.quote(origin: _origin, dest: _dest);
      if (!mounted) return;
      setState(() {
        _quote = q;
        if (!_priceEdited) _price.text = q.pricePerSeat.toString();
      });
    } catch (_) {
      // best-effort; leave the price as-is
    } finally {
      if (mounted) setState(() => _quoting = false);
    }
  }

  Future<void> _pickDateTime() async {
    final d = await showDatePicker(
      context: context,
      initialDate: _departure,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 30)),
    );
    if (d == null || !mounted) return;
    final t = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(_departure));
    if (t == null || !mounted) return;
    final picked = DateTime(d.year, d.month, d.day, t.hour, t.minute);
    // The backend allows a small backdate window for drivers logging a trip
    // late; anything older is a data-entry mistake. Catch it here for a
    // friendlier message than a 400.
    if (picked.isBefore(DateTime.now().subtract(const Duration(minutes: 60)))) {
      showSnack(context, 'Giờ khởi hành không được quá 60 phút trước', error: true);
      return;
    }
    setState(() => _departure = picked);
  }

  Future<void> _post() async {
    if (_posting) return;
    if (_vehicle == null) {
      showSnack(context, 'Chọn xe trước', error: true);
      return;
    }
    if (_origin.label == _dest.label) {
      showSnack(context, 'Điểm đi/đến phải khác nhau', error: true);
      return;
    }
    if (_departure.isBefore(DateTime.now().subtract(const Duration(minutes: 60)))) {
      showSnack(context, 'Giờ khởi hành đã quá hạn — chọn lại', error: true);
      return;
    }
    setState(() => _posting = true);
    try {
      await context.read<AppState>().rides.post(
            vehicleId: _vehicle!.id,
            origin: _origin,
            dest: _dest,
            departureTime: _departure,
            totalSeats: _seats,
            pricePerSeat: int.tryParse(_price.text.trim()),
          );
      if (!mounted) return;
      Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _posting = false);
      showSnack(context, e.friendly, error: true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _posting = false);
      showSnack(context, 'Đăng chuyến thất bại', error: true);
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
          final list = snap.data ?? [];
          if (list.isEmpty) {
            return const EmptyState(
              icon: Icons.directions_car_outlined,
              message: 'Bạn chưa đăng ký xe. Hãy đăng ký xe trước.',
            );
          }
          _vehicle ??= list.first;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              DropdownButtonFormField<Vehicle>(
                value: _vehicle,
                decoration: const InputDecoration(labelText: 'Xe'),
                items: list
                    .map((v) => DropdownMenuItem(value: v, child: Text('${v.plate} · ${v.seats} ghế')))
                    .toList(),
                onChanged: (v) => setState(() => _vehicle = v),
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
                  side: BorderSide(color: Colors.black.withOpacity(0.12)),
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
                    items: [1, 2, 3, 4, 6, 9]
                        .map((n) => DropdownMenuItem(value: n, child: Text('$n')))
                        .toList(),
                    onChanged: (v) => setState(() => _seats = v ?? 4),
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
                  helperText: 'Tự động tính theo quãng đường — bạn có thể chỉnh.',
                ),
              ),
              const SizedBox(height: 12),
              _note(),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _posting ? null : _post,
                child: _posting
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Đăng chuyến'),
              ),
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
      decoration: BoxDecoration(color: const Color(0xFFEAF4EE), borderRadius: BorderRadius.circular(12)),
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
            const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
        ],
      ),
    );
  }

  Widget _note() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: const Color(0xFFFBF6EC), borderRadius: BorderRadius.circular(12)),
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
          child: Text(text, style: TextStyle(fontSize: 12, color: Colors.black.withOpacity(0.7))),
        ),
      ],
    );
  }

  Widget _stop(String label, Stop value, ValueChanged<Stop> onChanged) {
    return InputDecorator(
      decoration: InputDecoration(labelText: label),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<Stop>(
          value: value,
          isExpanded: true,
          items: kStops.map((s) => DropdownMenuItem(value: s, child: Text(s.label))).toList(),
          onChanged: (s) => onChanged(s!),
        ),
      ),
    );
  }
}
