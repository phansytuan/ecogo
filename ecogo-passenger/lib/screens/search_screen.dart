import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:ecogo_core/ecogo_core.dart';
import '../state/app_state.dart';
import 'address_picker_screen.dart';
import 'results_screen.dart';
import 'my_trips_screen.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});
  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  Stop? _pickup;
  Stop? _dropoff;
  int _seats = 1;
  DateTime _when = DateTime.now();

  // Fare preview for the selected pair (passenger road distance x rate).
  FareQuote? _quote;
  bool _quoting = false;
  String? _quoteError;

  Future<void> _pickWhen() async {
    final d = await showDatePicker(
      context: context,
      initialDate: _when.isBefore(DateTime.now()) ? DateTime.now() : _when,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 30)),
    );
    if (d == null || !mounted) return;
    final t = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(_when));
    if (t == null || !mounted) return;
    setState(() => _when = DateTime(d.year, d.month, d.day, t.hour, t.minute));
  }

  void _confirmLogout(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Đăng xuất?'),
        content: const Text('Bạn sẽ cần nhập lại mã OTP để đăng nhập lại.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Huỷ')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Đăng xuất')),
        ],
      ),
    );
    if (ok == true && context.mounted) {
      context.read<AppState>().logout();
    }
  }

  Future<void> _pickAddress(bool isPickup) async {
    final picked = await Navigator.push<Stop>(
      context,
      MaterialPageRoute(
        builder: (_) => AddressPickerScreen(
          title: isPickup ? 'Chọn điểm đón' : 'Chọn điểm trả',
        ),
      ),
    );
    if (picked == null || !mounted) return;
    setState(() {
      if (isPickup) {
        _pickup = picked;
      } else {
        _dropoff = picked;
      }
    });
    _refreshQuote();
  }

  Future<void> _refreshQuote() async {
    final p = _pickup;
    final d = _dropoff;
    if (p == null || d == null) return;
    setState(() {
      _quoting = true;
      _quoteError = null;
      _quote = null;
    });
    try {
      final q = await context.read<AppState>().bookings.quote(
            pickup: p, dropoff: d, seats: _seats);
      if (!mounted || p != _pickup || d != _dropoff) return;
      setState(() {
        _quote = q;
        _quoting = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _quoting = false;
        _quoteError = e.friendly;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _quoting = false;
        _quoteError = 'Không tính được quãng đường, thử lại nhé';
      });
    }
  }

  void _search() {
    final p = _pickup;
    final d = _dropoff;
    if (p == null || d == null) {
      showSnack(context, 'Hãy chọn điểm đón và điểm trả trước', error: true);
      return;
    }
    if (p.label == d.label || (p.lat == d.lat && p.lng == d.lng)) {
      showSnack(context, 'Điểm đi và điểm đến phải khác nhau', error: true);
      return;
    }
    // Wide default window so a search around a chosen time still surfaces rides
    // posted earlier that morning or later in the day (strict matching adds no
    // padding of its own). Ranking still orders by time closeness.
    final start = _when.subtract(const Duration(hours: 3));
    final end = _when.add(const Duration(hours: 21));
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ResultsScreen(
          pickup: p,
          dropoff: d,
          windowStart: start.isBefore(DateTime.now()) ? DateTime.now() : start,
          windowEnd: end,
          seats: _seats,
        ),
      ),
    );
  }

  Widget _addressField({
    required String label,
    required IconData icon,
    required Stop? value,
    required VoidCallback onTap,
  }) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
          prefixIcon: Icon(icon),
          suffixIcon: const Icon(Icons.chevron_right),
        ),
        child: Text(
          value?.label ?? 'Chạm để nhập địa chỉ hoặc dùng GPS',
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: value == null ? Colors.black.withValues(alpha: 0.45) : Colors.black,
          ),
        ),
      ),
    );
  }

  Widget _quoteCard() {
    if (_pickup == null || _dropoff == null) return const SizedBox.shrink();
    Widget child;
    if (_quoting) {
      child = const Row(children: [
        SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
        SizedBox(width: 10),
        Text('Đang tính quãng đường và giá…', style: TextStyle(fontSize: 13)),
      ]);
    } else if (_quoteError != null) {
      child = Row(children: [
        const Icon(Icons.error_outline, color: Colors.red, size: 18),
        const SizedBox(width: 8),
        Expanded(child: Text(_quoteError!, style: const TextStyle(fontSize: 13))),
        TextButton(onPressed: _refreshQuote, child: const Text('Thử lại')),
      ]);
    } else if (_quote != null) {
      final q = _quote!;
      child = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            const Icon(Icons.route, size: 16, color: ecogoGreen),
            const SizedBox(width: 8),
            Text('Quãng đường của bạn: ${q.routeDistanceKm.toStringAsFixed(1)} km',
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
          ]),
          const SizedBox(height: 6),
          Row(children: [
            const Icon(Icons.payments, size: 16, color: ecogoGreen),
            const SizedBox(width: 8),
            Text(
              'Giá ước tính: ${formatMoney(q.farePerSeat)}/ghế'
              '${_seats > 1 ? ' × $_seats = ${formatMoney(q.totalFare)}' : ''}',
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: ecogoGreen),
            ),
          ]),
          const SizedBox(height: 4),
          Text('Tính theo quãng đường thực tế bạn đi, không phụ thuộc đường vòng của tài xế.',
              style: TextStyle(fontSize: 11, color: Colors.black.withValues(alpha: 0.5))),
        ],
      );
    } else {
      return const SizedBox.shrink();
    }
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF0F7F2),
        borderRadius: BorderRadius.circular(12),
      ),
      child: child,
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
            onPressed: () => _confirmLogout(context),
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _addressField(
                label: 'Điểm đón',
                icon: Icons.trip_origin,
                value: _pickup,
                onTap: () => _pickAddress(true),
              ),
              Align(
                alignment: Alignment.centerRight,
                child: IconButton(
                  tooltip: 'Đảo điểm đi / đến',
                  icon: const Icon(Icons.swap_vert),
                  onPressed: () {
                    setState(() {
                      final tmp = _pickup;
                      _pickup = _dropoff;
                      _dropoff = tmp;
                    });
                    _refreshQuote();
                  },
                ),
              ),
              _addressField(
                label: 'Điểm trả',
                icon: Icons.flag_outlined,
                value: _dropoff,
                onTap: () => _pickAddress(false),
              ),
              _quoteCard(),
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
                    onChanged: (v) {
                      setState(() => _seats = v ?? 1);
                      _refreshQuote();
                    },
                  ),
                ],
              ),
              const SizedBox(height: 12),
              ListTile(
                contentPadding: EdgeInsets.zero,
                shape: RoundedRectangleBorder(
                  side: BorderSide(color: Colors.black.withValues(alpha: 0.12)),
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
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}
