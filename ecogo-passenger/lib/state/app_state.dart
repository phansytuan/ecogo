import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:ecogo_core/ecogo_core.dart';

class AppState extends ChangeNotifier {
  final TokenStore tokens;
  late final ApiClient api;
  late final AuthService auth;
  late final MatchingService matching;
  late final BookingsService bookings;
  late final ChatService chat;
  final RealtimeService realtime = RealtimeService(Config.wsBase);

  AppState(SharedPreferences prefs) : tokens = TokenStore(prefs) {
    api = ApiClient(Config.apiBase, tokens, onUnauthorized: _onUnauthorized);
    auth = AuthService(api, tokens);
    matching = MatchingService(api);
    bookings = BookingsService(api);
    chat = ChatService(api);
    final t = tokens.access;
    if (t != null) realtime.connect(t);
  }

  void _onUnauthorized() {
    realtime.dispose();
    notifyListeners();
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
    realtime.dispose();
    notifyListeners();
  }
}
