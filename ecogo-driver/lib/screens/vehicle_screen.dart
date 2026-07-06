import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/app_state.dart';

class VehicleScreen extends StatefulWidget {
  const VehicleScreen({super.key});
  @override
  State<VehicleScreen> createState() => _VehicleScreenState();
}

class _VehicleScreenState extends State<VehicleScreen> {
  String _type = 'car_7';
  final _plate = TextEditingController();
  int _seats = 6;
  bool _isEv = false;

  static const _types = {
    'car_4': 'Xe 4 chỗ',
    'car_7': 'Xe 7 chỗ',
    'van_16': 'Xe 16 chỗ',
    'limousine': 'Limousine',
  };

  Future<void> _save() async {
    try {
      await context.read<AppState>().vehicles.create(
            type: _type,
            plate: _plate.text.trim(),
            seats: _seats,
            isEv: _isEv,
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
    return Scaffold(
      appBar: AppBar(title: const Text('Đăng ký xe')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            DropdownButtonFormField<String>(
              value: _type,
              decoration: const InputDecoration(labelText: 'Loại xe', border: OutlineInputBorder()),
              items: _types.entries
                  .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
                  .toList(),
              onChanged: (v) => setState(() => _type = v ?? 'car_7'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _plate,
              decoration: const InputDecoration(labelText: 'Biển số', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                const Text('Số ghế:'),
                const SizedBox(width: 12),
                DropdownButton<int>(
                  value: _seats,
                  items: [4, 6, 7, 9, 16]
                      .map((n) => DropdownMenuItem(value: n, child: Text('$n')))
                      .toList(),
                  onChanged: (v) => setState(() => _seats = v ?? 6),
                ),
              ],
            ),
            SwitchListTile(
              title: const Text('Xe điện'),
              value: _isEv,
              onChanged: (v) => setState(() => _isEv = v),
            ),
            const SizedBox(height: 12),
            FilledButton(onPressed: _save, child: const Text('Lưu')),
          ],
        ),
      ),
    );
  }
}
