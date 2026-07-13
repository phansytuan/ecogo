import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:ecogo_core/ecogo_core.dart';
import '../state/app_state.dart';

class VehicleScreen extends StatefulWidget {
  const VehicleScreen({super.key});
  @override
  State<VehicleScreen> createState() => _VehicleScreenState();
}

class _VehicleScreenState extends State<VehicleScreen> {
  late Future<List<Vehicle>> _vehicles;
  String _type = 'car_7';
  final _plate = TextEditingController();
  final _model = TextEditingController();
  int _seats = 6;
  bool _isEv = false;
  bool _busy = false;

  static const _types = {
    'car_4': 'Xe 4 chỗ',
    'car_7': 'Xe 7 chỗ',
    'van_16': 'Xe 16 chỗ',
    'limousine': 'Limousine',
  };

  static const _defaultSeats = {
    'car_4': 4,
    'car_7': 6,
    'van_16': 16,
    'limousine': 9,
  };

  static const _seatOptions = [4, 6, 7, 9, 16];

  @override
  void initState() {
    super.initState();
    _vehicles = context.read<AppState>().vehicles.mine();
  }

  void _load() {
    setState(() {
      _vehicles = context.read<AppState>().vehicles.mine();
    });
  }

  @override
  void dispose() {
    _plate.dispose();
    _model.dispose();
    super.dispose();
  }

  void _onTypeChanged(String? v) {
    if (v == null) return;
    setState(() {
      _type = v;
      _seats = _defaultSeats[v] ?? 6;
    });
  }

  Future<void> _save() async {
    final plate = _plate.text.trim().toUpperCase();
    if (plate.isEmpty) {
      showSnack(context, 'Nhập biển số xe', error: true);
      return;
    }
    setState(() => _busy = true);
    try {
      await context.read<AppState>().vehicles.create(
            type: _type,
            plate: plate,
            seats: _seats,
            model: _model.text.trim().isEmpty ? null : _model.text.trim(),
            isEv: _isEv,
          );
      if (!mounted) return;
      showSnack(context, 'Đã đăng ký xe');
      _plate.clear();
      _model.clear();
      _load();
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.friendly, error: true);
    } catch (_) {
      if (mounted) showSnack(context, 'Đăng ký xe thất bại', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Xe của tôi')),
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
            return ErrorView(message: msg, onRetry: _load);
          }
          final list = snap.data ?? [];
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (list.isNotEmpty) ...[
                Text('Đã đăng ký (${list.length})',
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                const SizedBox(height: 8),
                ...list.map((v) => Card(
                      child: ListTile(
                        leading: Icon(
                          v.isEv ? Icons.electric_car : Icons.directions_car,
                          color: ecogoGreen,
                        ),
                        title: Text(v.plate,
                            style: const TextStyle(fontWeight: FontWeight.w700)),
                        subtitle: Text(
                          [
                            _types[v.type] ?? v.type,
                            '${v.seats} ghế',
                            if (v.model != null) v.model!,
                          ].join(' · '),
                        ),
                        trailing: v.isEv
                            ? const Chip(
                                label: Text('EV'),
                                padding: EdgeInsets.zero,
                                labelStyle: TextStyle(fontSize: 11),
                              )
                            : null,
                      ),
                    )),
                const SizedBox(height: 24),
                const Divider(),
                const SizedBox(height: 16),
              ],
              Text('Đăng ký xe mới',
                  style: TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 15,
                      color: Colors.black.withValues(alpha: 0.7))),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _type,
                decoration: const InputDecoration(labelText: 'Loại xe'),
                items: _types.entries
                    .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
                    .toList(),
                onChanged: _onTypeChanged,
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _plate,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(
                  labelText: 'Biển số *',
                  hintText: 'VD: 29A-12345',
                  prefixIcon: Icon(Icons.app_registration),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _model,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(
                  labelText: 'Hãng xe / dòng xe (không bắt buộc)',
                  hintText: 'VD: Toyota Vios',
                  prefixIcon: Icon(Icons.directions_car_outlined),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  const Text('Số ghế:'),
                  const SizedBox(width: 12),
                  DropdownButton<int>(
                    value: _seats,
                    items: _seatOptions
                        .where((n) => n <= (_defaultSeats[_type] ?? 16))
                        .map((n) => DropdownMenuItem(value: n, child: Text('$n')))
                        .toList(),
                    onChanged: (v) => setState(() => _seats = v ?? _seats),
                  ),
                ],
              ),
              SwitchListTile(
                title: const Text('Xe điện (EV)'),
                value: _isEv,
                onChanged: (v) => setState(() => _isEv = v),
              ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: _busy ? null : _save,
                child: _busy
                    ? const SizedBox(
                        width: 20, height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Lưu'),
              ),
              const SizedBox(height: 24),
            ],
          );
        },
      ),
    );
  }
}
