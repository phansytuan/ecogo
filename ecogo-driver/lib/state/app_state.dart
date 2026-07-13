import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:ecogo_core/ecogo_core.dart';
import '../services/location_service.dart';

class AppState extends ChangeNotifier {
  final TokenStore tokens;
  late final ApiClient api;
  late final AuthService auth;
  late final VehiclesService vehicles;
  late final RidesService rides;
  late final BookingsService bookings;
  late final ChatService chat;
  final RealtimeService realtime = RealtimeService(Config.wsBase);
  final LocationService location = LocationService();

  AppState(SharedPreferences prefs) : tokens = TokenStore(prefs) {
    api = ApiClient(
      Config.apiBase,
      tokens,
      onUnauthorized: _onUnauthorized,
      onTokenRefreshed: _onTokenRefreshed,
    );
    auth = AuthService(api, tokens);
    vehicles = VehiclesService(api);
    rides = RidesService(api);
    bookings = BookingsService(api);
    chat = ChatService(api);
    final t = tokens.access;
    if (t != null) realtime.connect(t);
  }

  void _onUnauthorized() {
    realtime.leaveRooms();
    realtime.dispose();
    notifyListeners();
  }

  /// The access token was silently refreshed — re-auth the socket so live
  /// tracking and chat keep working past token expiry.
  void _onTokenRefreshed(String token) {
    realtime.reauth(token);
  }

  bool get isLoggedIn => auth.isLoggedIn;
  String? get userId => auth.userId;

  Future<String?> requestOtp(String phone) => auth.requestOtp(phone);

  Future<void> verifyOtp(String phone, String code) async {
    await auth.verifyOtp(phone, code);
    final t = tokens.access;
    if (t != null) realtime.connect(t);
    notifyListeners();
  }

  Future<void> logout() async {
    await auth.logout();
    realtime.leaveRooms();
    realtime.dispose();
    notifyListeners();
  }
}
