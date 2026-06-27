import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/bookings_service.dart';
import '../services/chat_service.dart';
import '../services/matching_service.dart';
import '../services/realtime_service.dart';

class AppState extends ChangeNotifier {
  final ApiClient api;
  final AuthService auth;
  final MatchingService matching;
  final BookingsService bookings;
  final ChatService chat;
  final RealtimeService realtime;

  AppState(SharedPreferences prefs)
      : api = ApiClient(Config.apiBase),
        auth = AuthService(ApiClient(Config.apiBase), prefs),
        matching = MatchingService(ApiClient(Config.apiBase)),
        bookings = BookingsService(ApiClient(Config.apiBase)),
        chat = ChatService(ApiClient(Config.apiBase)),
        realtime = RealtimeService(Config.wsBase) {
    // Share a single ApiClient (and its token) across all services.
    _wire(prefs);
  }

  void _wire(SharedPreferences prefs) {
    final token = prefs.getString('token');
    for (final c in [matching.api, bookings.api, chat.api]) {
      c.setToken(token);
    }
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
    final token = auth.prefs.getString('token');
    for (final c in [api, matching.api, bookings.api, chat.api]) {
      c.setToken(token);
    }
    if (token != null) realtime.connect(token);
    notifyListeners();
  }

  Future<void> logout() async {
    await auth.logout();
    for (final c in [api, matching.api, bookings.api, chat.api]) {
      c.setToken(null);
    }
    realtime.dispose();
    notifyListeners();
  }
}
