import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:ecogo_core/ecogo_core.dart';
import '../state/app_state.dart';
import 'results_screen.dart';
import 'my_trips_screen.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});
  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  Stop _pickup = kStops.first;
  Stop _dropoff = kStops.last;
  int _seats = 1;
  DateTime _when = DateTime.now();

  Future<void> _pickWhen() async {
    final d = await showDatePicker(
      context: context,
      initialDate: _when.isBefore(DateTime.now()) ? DateTime.now() : _when,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 30)),
    );
    if (d == null || !mounted) return;
    final t = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(_when));
    if (t == null) return;
    setState(() => _when = DateTime(d.year, d.month, d.day, t.hour, t.minute));
  }

  void _search() {
    if (_pickup.label == _dropoff.label) {
      showSnack(context, 'Điểm đi và điểm đến phải khác nhau', error: true);
      return;
    }
    // Search a window around the desired departure: a little before (in case the
    // driver leaves slightly early) through several hours after.
    final start = _when.subtract(const Duration(hours: 1));
    final end = _when.add(const Duration(hours: 6));
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ResultsScreen(
          pickup: _pickup,
          dropoff: _dropoff,
          windowStart: start.isBefore(DateTime.now()) ? DateTime.now() : start,
          windowEnd: end,
          seats: _seats,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Tìm chuyến ghép'),
        actions: [
          IconButton(
            tooltip: 'Chuyến của tôi',
            icon: const Icon(Icons.confirmation_number_outlined),
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const MyTripsScreen()),
            ),
          ),
          IconButton(
            tooltip: 'Đăng xuất',
            icon: const Icon(Icons.logout),
            onPressed: () => context.read<AppState>().logout(),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _stopDropdown('Điểm đón', _pickup, (s) => setState(() => _pickup = s)),
            const SizedBox(height: 12),
            _stopDropdown('Điểm trả', _dropoff, (s) => setState(() => _dropoff = s)),
            const SizedBox(height: 12),
            Row(
              children: [
                const Text('Số ghế:'),
                const SizedBox(width: 12),
                DropdownButton<int>(
                  value: _seats,
                  items: [1, 2, 3, 4]
                      .map((n) => DropdownMenuItem(value: n, child: Text('$n')))
                      .toList(),
                  onChanged: (v) => setState(() => _seats = v ?? 1),
                ),
              ],
            ),
            const SizedBox(height: 12),
            ListTile(
              contentPadding: EdgeInsets.zero,
              shape: RoundedRectangleBorder(
                side: BorderSide(color: Colors.black.withOpacity(0.12)),
                borderRadius: BorderRadius.circular(12),
              ),
              leading: const Icon(Icons.schedule),
              title: const Text('Thời gian đi'),
              subtitle: Text(
                '${_when.day.toString().padLeft(2, '0')}/${_when.month.toString().padLeft(2, '0')} '
                '${_when.hour.toString().padLeft(2, '0')}:${_when.minute.toString().padLeft(2, '0')}',
              ),
              trailing: const Icon(Icons.edit_calendar),
              onTap: _pickWhen,
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: _search,
              icon: const Icon(Icons.search),
              label: const Text('Tìm chuyến'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _stopDropdown(String label, Stop value, ValueChanged<Stop> onChanged) {
    return InputDecorator(
      decoration: InputDecoration(labelText: label, border: const OutlineInputBorder()),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<Stop>(
          value: value,
          isExpanded: true,
          items: kStops
              .map((s) => DropdownMenuItem(value: s, child: Text(s.label)))
              .toList(),
          onChanged: (s) => onChanged(s!),
        ),
      ),
    );
  }
}
