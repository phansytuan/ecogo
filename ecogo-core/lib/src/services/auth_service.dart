import 'api_client.dart';
import 'token_store.dart';

class AuthService {
  final ApiClient api;
  final TokenStore tokens;
  AuthService(this.api, this.tokens);

  bool get isLoggedIn => tokens.access != null;
  String? get userId => tokens.userId;

  Future<String?> requestOtp(String phone) async {
    final r = await api.post('/auth/request-otp', {'phone': phone});
    return r is Map ? r['devCode'] as String? : null;
  }

  Future<void> verifyOtp(String phone, String code) async {
    final r = await api.post('/auth/verify-otp', {'phone': phone, 'code': code});
    await tokens.setSession(
      r['accessToken'] as String,
      r['refreshToken'] as String,
      (r['user'] as Map)['id'] as String,
    );
  }

  Future<void> logout() async {
    final rt = tokens.refresh;
    if (rt != null) {
      try {
        await api.post('/auth/logout', {'refreshToken': rt});
      } catch (_) {}
    }
    await tokens.clear();
  }
}
