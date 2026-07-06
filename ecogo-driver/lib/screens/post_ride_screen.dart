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
  final _price = TextEditingController(text: '200000');

  @override
  void initState() {
    super.initState();
    _vehicles = context.read<AppState>().vehicles.mine();
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
    if (t == null) return;
    setState(() => _departure = DateTime(d.year, d.month, d.day, t.hour, t.minute));
  }

  Future<void> _post() async {
    if (_vehicle == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Chọn xe trước')));
      return;
    }
    if (_origin.label == _dest.label) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Điểm đi/đến phải khác nhau')));
      return;
    }
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
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('dd/MM HH:mm');
    return Scaffold(
      appBar: AppBar(title: const Text('Đăng chuyến')),
      body: FutureBuilder<List<Vehicle>>(
        future: _vehicles,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          final list = snap.data ?? [];
          if (list.isEmpty) {
            return const Center(child: Text('Bạn chưa đăng ký xe. Hãy đăng ký xe trước.'));
          }
          _vehicle ??= list.first;
          return Padding(
            padding: const EdgeInsets.all(16),
            child: ListView(
              children: [
                DropdownButtonFormField<Vehicle>(
                  value: _vehicle,
                  decoration: const InputDecoration(labelText: 'Xe', border: OutlineInputBorder()),
                  items: list
                      .map((v) => DropdownMenuItem(value: v, child: Text('${v.plate} · ${v.seats} ghế')))
                      .toList(),
                  onChanged: (v) => setState(() => _vehicle = v),
                ),
                const SizedBox(height: 12),
                _stop('Điểm đi', _origin, (s) => setState(() => _origin = s)),
                const SizedBox(height: 12),
                _stop('Điểm đến', _dest, (s) => setState(() => _dest = s)),
                const SizedBox(height: 12),
                ListTile(
                  shape: RoundedRectangleBorder(
                    side: const BorderSide(color: Colors.grey),
                    borderRadius: BorderRadius.circular(4),
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
                  decoration: const InputDecoration(labelText: 'Giá mỗi ghế (đ)', border: OutlineInputBorder()),
                ),
                const SizedBox(height: 20),
                FilledButton(onPressed: _post, child: const Text('Đăng chuyến')),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _stop(String label, Stop value, ValueChanged<Stop> onChanged) {
    return InputDecorator(
      decoration: InputDecoration(labelText: label, border: const OutlineInputBorder()),
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
