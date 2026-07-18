import 'package:ecogo_core/ecogo_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import 'address_picker_screen.dart';

/// Replace a posted ride's route (only while open/full with no bookings —
/// the backend enforces both and returns a friendly 409 otherwise).
class EditRouteScreen extends StatefulWidget {
  final Ride ride;

  const EditRouteScreen({super.key, required this.ride});

  @override
  State<EditRouteScreen> createState() => _EditRouteScreenState();
}

class _EditRouteScreenState extends State<EditRouteScreen> {
  Stop? _origin;
  Stop? _dest;
  final List<Stop> _waypoints = [];
  RouteQuote? _quote;
  bool _quoting = false;
  bool _busy = false;

  Future<void> _pickEndpoint({
    required String title,
    required ValueChanged<Stop> onSelected,
  }) async {
    final stop = await Navigator.push<Stop>(
      context,
      MaterialPageRoute(builder: (_) => AddressPickerScreen(title: title)),
    );
    if (stop == null || !mounted) return;
    onSelected(stop);
    _fetchQuote();
  }

  Future<void> _fetchQuote() async {
    final origin = _origin;
    final dest = _dest;
    if (origin == null || dest == null) {
      if (mounted) setState(() => _quote = null);
      return;
    }

    setState(() => _quoting = true);
    try {
      final quote = await context.read<AppState>().rides.quote(
            origin: origin,
            dest: dest,
            waypoints: _waypoints,
          );
      if (mounted) setState(() => _quote = quote);
    } on ApiException catch (error) {
      if (mounted) showSnack(context, error.friendly, error: true);
    } finally {
      if (mounted) setState(() => _quoting = false);
    }
  }

  Future<bool> _confirmUpdate() async {
    return await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Cập nhật tuyến?'),
            content: const Text(
              'Tuyến mới sẽ thay thế tuyến cũ. '
              'Chỉ đổi được khi chưa có khách đặt.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Quay lại'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Cập nhật'),
              ),
            ],
          ),
        ) ??
        false;
  }

  Future<void> _submit() async {
    final origin = _origin;
    final dest = _dest;
    if (origin == null || dest == null) {
      showSnack(context, 'Vui lòng chọn lại cả điểm đi và điểm đến',
          error: true);
      return;
    }
    if (!await _confirmUpdate() || !mounted) return;

    setState(() => _busy = true);
    try {
      await context.read<AppState>().rides.updateRoute(
            rideId: widget.ride.id,
            origin: origin,
            dest: dest,
            waypoints: _waypoints,
          );
      if (!mounted) return;
      showSnack(context, 'Đã cập nhật tuyến');
      Navigator.pop(context, true);
    } on ApiException catch (error) {
      if (mounted) showSnack(context, error.friendly, error: true);
    } catch (error) {
      if (mounted) showSnack(context, 'Không thể cập nhật tuyến', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _endpoint(String label, Stop? value, ValueChanged<Stop> onSelected) {
    return Card(
      child: ListTile(
        leading: Icon(
          label == 'Điểm đi' ? Icons.trip_origin : Icons.location_on,
        ),
        title: Text(label),
        subtitle: Text(
          value?.label ?? 'Chạm để chọn',
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: value == null
            ? const Icon(Icons.chevron_right)
            : IconButton(
                tooltip: 'Xoá',
                icon: const Icon(Icons.close),
                onPressed: _busy
                    ? null
                    : () {
                        setState(() {
                          if (label == 'Điểm đi') {
                            _origin = null;
                          } else {
                            _dest = null;
                          }
                          _quote = null;
                        });
                      },
              ),
        onTap: _busy
            ? null
            : () => _pickEndpoint(title: 'Chọn $label', onSelected: onSelected),
      ),
    );
  }

  Widget _waypointsSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var index = 0; index < _waypoints.length; index++)
          ListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.alt_route),
            title: Text(
              _waypoints[index].label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            trailing: IconButton(
              tooltip: 'Xoá điểm dừng',
              icon: const Icon(Icons.close),
              onPressed: _busy
                  ? null
                  : () {
                      setState(() => _waypoints.removeAt(index));
                      _fetchQuote();
                    },
            ),
          ),
        if (_waypoints.length < 3)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: _busy
                  ? null
                  : () async {
                      final stop = await Navigator.push<Stop>(
                        context,
                        MaterialPageRoute(
                          builder: (_) => const AddressPickerScreen(
                            title: 'Chọn điểm dừng',
                          ),
                        ),
                      );
                      if (stop == null || !mounted) return;
                      setState(() => _waypoints.add(stop));
                      _fetchQuote();
                    },
              icon: const Icon(Icons.add),
              label: const Text('Thêm điểm dừng (đi qua)'),
            ),
          ),
      ],
    );
  }

  Widget _quoteCard() {
    if (_quoting) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Center(child: CircularProgressIndicator()),
        ),
      );
    }
    final quote = _quote;
    if (quote == null) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Text('Chọn đủ điểm đi và điểm đến để xem tuyến mới.'),
        ),
      );
    }
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            const Icon(Icons.route),
            const SizedBox(width: 12),
            Text(
              '${quote.km.toStringAsFixed(1)} km',
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final currentOrigin = widget.ride.originLabel ?? '—';
    final currentDest = widget.ride.destLabel ?? '—';

    return Scaffold(
      appBar: AppBar(title: const Text('Sửa tuyến')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Tuyến hiện tại: $currentOrigin → $currentDest',
            style: Theme.of(context).textTheme.titleSmall,
          ),
          const SizedBox(height: 8),
          const Text('Vui lòng chọn lại cả hai đầu tuyến trước khi cập nhật.'),
          const SizedBox(height: 16),
          _endpoint('Điểm đi', _origin, (stop) {
            setState(() => _origin = stop);
          }),
          const SizedBox(height: 8),
          _endpoint('Điểm đến', _dest, (stop) {
            setState(() => _dest = stop);
          }),
          const SizedBox(height: 12),
          _waypointsSection(),
          const SizedBox(height: 12),
          _quoteCard(),
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: _busy ? null : _submit,
            icon: _busy
                ? const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.save),
            label: const Text('Cập nhật tuyến'),
          ),
        ],
      ),
    );
  }
}
