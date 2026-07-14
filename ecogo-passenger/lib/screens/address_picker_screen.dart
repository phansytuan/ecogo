import 'dart:async';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:provider/provider.dart';
import 'package:ecogo_core/ecogo_core.dart';
import '../state/app_state.dart';

/// Full-screen address search: autocomplete against the backend places proxy,
/// the current GPS location (reverse geocoded), or a corridor quick pick.
/// Pops with a [Stop] (label = full formatted address, coordinates from the
/// geocoder — the backend never trusts the text alone).
class AddressPickerScreen extends StatefulWidget {
  final String title;
  const AddressPickerScreen({super.key, required this.title});

  @override
  State<AddressPickerScreen> createState() => _AddressPickerScreenState();
}

class _AddressPickerScreenState extends State<AddressPickerScreen> {
  final _controller = TextEditingController();
  Timer? _debounce;
  List<PlaceSuggestion> _suggestions = [];
  bool _searching = false;
  String? _searchError;
  bool _resolving = false; // a suggestion/GPS pick is being resolved
  bool _locating = false;
  String? _gpsError;
  bool _gpsDeniedForever = false;

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String text) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () => _search(text));
  }

  Future<void> _search(String text) async {
    final q = text.trim();
    if (q.isEmpty) {
      setState(() {
        _suggestions = [];
        _searchError = null;
        _searching = false;
      });
      return;
    }
    setState(() {
      _searching = true;
      _searchError = null;
    });
    try {
      final got = await context.read<AppState>().places.autocomplete(q);
      if (!mounted || _controller.text.trim() != q) return;
      setState(() {
        _suggestions = got;
        _searching = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _searching = false;
        _searchError = e.friendly;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _searching = false;
        _searchError = 'Không tìm được địa chỉ, thử lại nhé';
      });
    }
  }

  Future<void> _pickSuggestion(PlaceSuggestion s) async {
    if (_resolving) return;
    setState(() => _resolving = true);
    try {
      final d = await context.read<AppState>().places.detail(s.placeId);
      if (!mounted) return;
      Navigator.pop(context, Stop(d.address, d.lat, d.lng, placeId: d.placeId));
    } on ApiException catch (e) {
      if (!mounted) return;
      showSnack(context, e.friendly, error: true);
      setState(() => _resolving = false);
    } catch (_) {
      if (!mounted) return;
      showSnack(context, 'Không lấy được toạ độ địa chỉ này', error: true);
      setState(() => _resolving = false);
    }
  }

  Future<void> _useCurrentLocation() async {
    setState(() {
      _locating = true;
      _gpsError = null;
      _gpsDeniedForever = false;
    });
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        throw const _GpsUnavailable('Định vị (GPS) đang tắt — bật định vị rồi thử lại.');
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.deniedForever) {
        setState(() {
          _locating = false;
          _gpsDeniedForever = true;
          _gpsError = 'Quyền vị trí bị từ chối. Hãy cấp quyền trong Cài đặt.';
        });
        return;
      }
      if (permission == LocationPermission.denied) {
        throw const _GpsUnavailable('Cần quyền vị trí để chọn điểm đón hiện tại.');
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      ).timeout(const Duration(seconds: 15));
      if (!mounted) return;
      final d = await context.read<AppState>().places.reverse(pos.latitude, pos.longitude);
      if (!mounted) return;
      Navigator.pop(context, Stop(d.address, d.lat, d.lng, placeId: d.placeId));
    } on _GpsUnavailable catch (e) {
      if (!mounted) return;
      setState(() {
        _locating = false;
        _gpsError = e.message;
      });
    } on TimeoutException {
      if (!mounted) return;
      setState(() {
        _locating = false;
        _gpsError = 'Không lấy được vị trí (quá lâu). Thử lại nhé.';
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _locating = false;
        _gpsError = 'Đã có vị trí nhưng không tra được địa chỉ: ${e.friendly}';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _locating = false;
        _gpsError = 'Không lấy được vị trí hiện tại. Thử lại nhé.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final query = _controller.text.trim();
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: TextField(
                controller: _controller,
                autofocus: true,
                onChanged: _onChanged,
                textInputAction: TextInputAction.search,
                decoration: InputDecoration(
                  labelText: 'Nhập địa chỉ chi tiết',
                  hintText: 'VD: 15 Võ Thị Sáu, phường Trường Vinh, tỉnh Nghệ An',
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: query.isEmpty
                      ? null
                      : IconButton(
                          icon: const Icon(Icons.clear),
                          onPressed: () {
                            _controller.clear();
                            _onChanged('');
                            setState(() {});
                          },
                        ),
                ),
              ),
            ),
            ListTile(
              leading: _locating
                  ? const SizedBox(
                      width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.my_location, color: ecogoGreen),
              title: const Text('Dùng vị trí hiện tại (GPS)'),
              subtitle: _gpsError != null
                  ? Text(_gpsError!, style: const TextStyle(color: Colors.red, fontSize: 12))
                  : null,
              trailing: _gpsDeniedForever
                  ? TextButton(
                      onPressed: () => Geolocator.openAppSettings(),
                      child: const Text('Cài đặt'),
                    )
                  : (_gpsError != null
                      ? TextButton(onPressed: _useCurrentLocation, child: const Text('Thử lại'))
                      : null),
              onTap: _locating || _resolving ? null : _useCurrentLocation,
            ),
            const Divider(height: 1),
            Expanded(child: _results(query)),
          ],
        ),
      ),
    );
  }

  Widget _results(String query) {
    if (_resolving) {
      return const LoadingView(label: 'Đang lấy toạ độ địa chỉ…');
    }
    if (_searching) {
      return const LoadingView(label: 'Đang tìm địa chỉ…');
    }
    if (_searchError != null) {
      return ErrorView(message: _searchError!, onRetry: () => _search(_controller.text));
    }
    if (query.isEmpty) {
      // Quick picks: the corridor towns the service runs between.
      return ListView(
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: Text('Điểm phổ biến trên tuyến',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
          ),
          ...kStops.map((s) => ListTile(
                leading: const Icon(Icons.location_city_outlined),
                title: Text(s.label),
                onTap: () => Navigator.pop(context, s),
              )),
        ],
      );
    }
    if (_suggestions.isEmpty) {
      return const EmptyState(
        icon: Icons.search_off_rounded,
        message: 'Không tìm thấy địa chỉ phù hợp.\nThử nhập rõ hơn (số nhà, đường, tỉnh/thành).',
      );
    }
    return ListView.builder(
      itemCount: _suggestions.length,
      itemBuilder: (_, i) {
        final s = _suggestions[i];
        return ListTile(
          leading: const Icon(Icons.place_outlined),
          title: Text(s.description),
          onTap: () => _pickSuggestion(s),
        );
      },
    );
  }
}

class _GpsUnavailable implements Exception {
  final String message;
  const _GpsUnavailable(this.message);
}
