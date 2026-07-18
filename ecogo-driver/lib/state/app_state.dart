import 'package:flutter/foundation.dart';
import 'package:ecogo_core/ecogo_core.dart';
import '../services/location_service.dart';

class AppState extends ChangeNotifier {
  final TokenStore tokens;
  late final ApiClient api;
  late final AuthService auth;
  late final VehiclesService vehicles;
  late final RidesService rides;
  late final PlacesService places;
  late final BookingsService bookings;
  late final ChatService chat;
  late final RatingsService ratings;
  late final NotificationsService notifications;
  final RealtimeService realtime = RealtimeService(Config.wsBase);
  final LocationService location = LocationService();
  String? _pendingPushToken;

  AppState(this.tokens) {
    api = ApiClient(
      Config.apiBase,
      tokens,
      onUnauthorized: _onUnauthorized,
      onTokenRefreshed: _onTokenRefreshed,
    );
    auth = AuthService(api, tokens);
    vehicles = VehiclesService(api);
    rides = RidesService(api);
    places = PlacesService(api);
    bookings = BookingsService(api);
    chat = ChatService(api);
    ratings = RatingsService(api);
    notifications = NotificationsService(api);
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
    await _flushPushToken();
    notifyListeners();
  }

  /// Called by the platform push layer once it has an FCM/APNs token. Stored
  /// until the user is authenticated, then registered with the backend. Wire
  /// this from firebase_messaging.getToken()/onTokenRefresh in main().
  Future<void> setPushToken(String token, {String? platform}) async {
    _pendingPushToken = token;
    if (isLoggedIn) await _flushPushToken(platform: platform);
  }

  Future<void> _flushPushToken({String? platform}) async {
    final tok = _pendingPushToken;
    if (tok == null || !isLoggedIn) return;
    try {
      await notifications.registerToken(tok, platform: platform);
      _pendingPushToken = null;
    } catch (_) {
      // Non-fatal: will retry on next login/app start.
    }
  }

  /// Called when the app returns to the foreground: reconnect the socket if we
  /// have a session but the socket was dropped while backgrounded.
  void onResumed() {
    final t = tokens.access;
    if (t != null) realtime.reauth(t);
  }

  Future<void> logout() async {
    await auth.logout();
    realtime.leaveRooms();
    realtime.dispose();
    notifyListeners();
  }
}
