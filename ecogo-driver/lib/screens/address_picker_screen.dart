import 'dart:async';
import 'package:ecogo_core/ecogo_core.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:provider/provider.dart';
import '../state/app_state.dart';

class AddressPickerScreen extends StatefulWidget {
  final String title;
  const AddressPickerScreen({super.key, required this.title});
  @override
  State<AddressPickerScreen> createState() => _AddressPickerScreenState();
}

class _AddressPickerScreenState extends State<AddressPickerScreen> {
  final input = TextEditingController();
  Timer? debounce;
  List<PlaceSuggestion> suggestions = [];
  bool searching = false,
      resolving = false,
      locating = false,
      deniedForever = false;
  String? error, gpsError;
  int request = 0;

  @override
  void dispose() {
    debounce?.cancel();
    input.dispose();
    super.dispose();
  }

  void changed(String value) {
    debounce?.cancel();
    final id = ++request;
    debounce =
        Timer(const Duration(milliseconds: 350), () => search(value, id));
    setState(() {});
  }

  Future<void> search(String value, int id) async {
    final q = value.trim();
    if (q.length < 2) {
      if (mounted) {
        setState(() {
          suggestions = [];
          searching = false;
          error = null;
        });
      }
      return;
    }
    setState(() {
      searching = true;
      error = null;
    });
    try {
      final result = await context.read<AppState>().places.autocomplete(q);
      if (!mounted || id != request || input.text.trim() != q) return;
      setState(() {
        suggestions = result;
        searching = false;
      });
    } on ApiException catch (e) {
      if (mounted && id == request) {
        setState(() {
          searching = false;
          error = e.friendly;
        });
      }
    } catch (_) {
      if (mounted && id == request) {
        setState(() {
          searching = false;
          error = 'Không thể tìm địa chỉ lúc này';
        });
      }
    }
  }

  Future<void> select(PlaceSuggestion suggestion) async {
    final id = ++request;
    setState(() => resolving = true);
    try {
      final p =
          await context.read<AppState>().places.detail(suggestion.placeId);
      if (!mounted || id != request) return;
      Navigator.pop(context, Stop(p.address, p.lat, p.lng, placeId: p.placeId));
    } catch (_) {
      if (mounted) {
        setState(() {
          resolving = false;
          error = 'Không lấy được tọa độ. Hãy thử lại.';
        });
      }
    }
  }

  Future<void> gps() async {
    final places = context.read<AppState>().places;
    setState(() {
      locating = true;
      gpsError = null;
      deniedForever = false;
    });
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        throw 'Dịch vụ vị trí đang tắt.';
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.deniedForever) {
        if (mounted) {
          setState(() {
            deniedForever = true;
            locating = false;
            gpsError = 'Quyền vị trí bị từ chối vĩnh viễn.';
          });
        }
        return;
      }
      if (permission == LocationPermission.denied) {
        throw 'Cần quyền vị trí để tiếp tục.';
      }
      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 15),
      );
      if (pos.accuracy > 500) {
        throw 'Vị trí có độ chính xác quá thấp (${pos.accuracy.round()} m).';
      }
      final p = await places.reverse(pos.latitude, pos.longitude);
      if (!mounted) return;
      Navigator.pop(
          context,
          Stop(p.address, pos.latitude, pos.longitude,
              placeId: p.placeId, locationSource: LocationSource.currentGps));
    } on TimeoutException {
      if (mounted) {
        setState(() {
          locating = false;
          gpsError = 'GPS quá thời gian. Hãy thử lại.';
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          locating = false;
          gpsError = e is ApiException
              ? 'Đã có tọa độ nhưng không tra được địa chỉ: ${e.friendly}'
              : e.toString();
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: Column(children: [
        Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
                controller: input,
                autofocus: true,
                onChanged: changed,
                decoration: InputDecoration(
                    labelText: 'Địa chỉ chi tiết',
                    hintText: '15 Võ Thị Sáu, phường Trường Vinh…',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: input.text.isEmpty
                        ? null
                        : IconButton(
                            icon: const Icon(Icons.clear),
                            onPressed: () {
                              input.clear();
                              changed('');
                            })))),
        ListTile(
            leading: locating
                ? const CircularProgressIndicator()
                : const Icon(Icons.my_location),
            title: const Text('Dùng vị trí hiện tại'),
            subtitle: gpsError == null
                ? null
                : Text(gpsError!, style: const TextStyle(color: Colors.red)),
            trailing: deniedForever
                ? const TextButton(
                    onPressed: Geolocator.openAppSettings,
                    child: Text('Cài đặt'))
                : gpsError != null
                    ? TextButton(onPressed: gps, child: const Text('Thử lại'))
                    : null,
            onTap: locating ? null : gps),
        const Divider(),
        Expanded(
            child: resolving
                ? const LoadingView(label: 'Đang lấy tọa độ…')
                : searching
                    ? const LoadingView(label: 'Đang tìm địa chỉ…')
                    : error != null
                        ? ErrorView(
                            message: error!,
                            onRetry: () => search(input.text, ++request))
                        : input.text.trim().length < 2
                            ? const EmptyState(
                                icon: Icons.location_on_outlined,
                                message: 'Nhập ít nhất 2 ký tự để tìm địa chỉ')
                            : suggestions.isEmpty
                                ? const EmptyState(
                                    icon: Icons.search_off,
                                    message: 'Không tìm thấy địa chỉ')
                                : ListView(
                                    children: suggestions
                                        .map((s) => ListTile(
                                            title: Text(s.description),
                                            onTap: () => select(s)))
                                        .toList()))
      ]));
}
