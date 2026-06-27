import 'package:shared_preferences/shared_preferences.dart';
import 'api_client.dart';

class AuthService {
  final ApiClient api;
  final SharedPreferences prefs;
  static const _key = 'token';

  AuthService(this.api, this.prefs) {
    final t = prefs.getString(_key);
    if (t != null) api.setToken(t);
  }

  bool get isLoggedIn => prefs.getString(_key) != null;
  String? get userId => prefs.getString('uid');

  /// Returns the dev OTP code when the backend is in fake mode, else null.
  Future<String?> requestOtp(String phone) async {
    final r = await api.post('/auth/request-otp', {'phone': phone});
    return r is Map ? r['devCode'] as String? : null;
  }

  Future<void> verifyOtp(String phone, String code) async {
    final r = await api.post('/auth/verify-otp', {'phone': phone, 'code': code});
    final token = r['accessToken'] as String;
    await prefs.setString(_key, token);
    await prefs.setString('uid', (r['user'] as Map)['id'] as String);
    api.setToken(token);
  }

  Future<void> logout() async {
    await prefs.remove(_key);
    api.setToken(null);
  }
}
