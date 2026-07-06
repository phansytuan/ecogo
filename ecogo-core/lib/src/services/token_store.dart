import 'package:shared_preferences/shared_preferences.dart';

/// Persists the access token, refresh token, and user id.
class TokenStore {
  final SharedPreferences prefs;
  TokenStore(this.prefs);

  static const _kAccess = 'token';
  static const _kRefresh = 'refresh';
  static const _kUid = 'uid';

  String? get access => prefs.getString(_kAccess);
  String? get refresh => prefs.getString(_kRefresh);
  String? get userId => prefs.getString(_kUid);

  Future<void> setSession(String access, String refresh, [String? uid]) async {
    await prefs.setString(_kAccess, access);
    await prefs.setString(_kRefresh, refresh);
    if (uid != null) await prefs.setString(_kUid, uid);
  }

  Future<void> clear() async {
    await prefs.remove(_kAccess);
    await prefs.remove(_kRefresh);
    await prefs.remove(_kUid);
  }
}
