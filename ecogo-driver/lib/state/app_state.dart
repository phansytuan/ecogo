import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/bookings_service.dart';
import '../services/chat_service.dart';
import '../services/location_service.dart';
import '../services/realtime_service.dart';
import '../services/rides_service.dart';
import '../services/vehicles_service.dart';

class AppState extends ChangeNotifier {
  final SharedPreferences prefs;
  final ApiClient api = ApiClient(Config.apiBase);

  late final AuthService auth = AuthService(api, prefs);
  late final VehiclesService vehicles = VehiclesService(api);
  late final RidesService rides = RidesService(api);
  late final BookingsService bookings = BookingsService(api);
  late final ChatService chat = ChatService(api);
  final RealtimeService realtime = RealtimeService(Config.wsBase);
  final LocationService location = LocationService();

  AppState(this.prefs) {
    final token = prefs.getString('token');
    if (token != null) {
      api.setToken(token);
      realtime.connect(token);
    }
  }

  bool get isLoggedIn => auth.isLoggedIn;
  String? get userId => auth.userId;

  Future<String?> requestOtp(String phone) => auth.requestOtp(phone);

  Future<void> verifyOtp(String phone, String code) async {
    await auth.verifyOtp(phone, code);
    final token = prefs.getString('token');
    if (token != null) realtime.connect(token);
    notifyListeners();
  }

  Future<void> logout() async {
    await auth.logout();
    realtime.dispose();
    notifyListeners();
  }
}
