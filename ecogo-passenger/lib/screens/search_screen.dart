import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:ecogo_core/ecogo_core.dart';
import '../state/app_state.dart';
import 'results_screen.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});
  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  Stop _pickup = kStops.first;
  Stop _dropoff = kStops.last;
  int _seats = 1;

  void _search() {
    if (_pickup.label == _dropoff.label) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Điểm đi và điểm đến phải khác nhau')),
      );
      return;
    }
    final now = DateTime.now();
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ResultsScreen(
          pickup: _pickup,
          dropoff: _dropoff,
          windowStart: now,
          windowEnd: now.add(const Duration(hours: 4)),
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
