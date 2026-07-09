import 'dart:convert';
import 'package:http/http.dart' as http;
import 'token_store.dart';

class ApiException implements Exception {
  final int status;
  final String body;
  ApiException(this.status, this.body);

  /// A short, user-friendly message for SnackBars.
  String get friendly {
    if (status == 0) return 'Không có kết nối mạng';
    String? serverMsg;
    try {
      final decoded = jsonDecode(body);
      if (decoded is Map && decoded['message'] != null) {
        final m = decoded['message'];
        serverMsg = m is List ? m.join(', ') : m.toString();
      }
    } catch (_) {}
    // A bare "Unauthorized" from the auth guard means the session token is no
    // longer valid — show the friendly session-expired copy. But a 401 with a
    // domain message (e.g. a wrong OTP on the login screen) should surface that
    // message, exactly like every other status does.
    if (status == 401 && (serverMsg == null || serverMsg == 'Unauthorized')) {
      return 'Phiên đăng nhập đã hết hạn';
    }
    return serverMsg ?? 'Đã có lỗi xảy ra ($status)';
  }

  @override
  String toString() => 'API $status: $body';
}

/// HTTP client with transparent access-token refresh: on a 401 it tries the
/// refresh token once, then retries the original request.
class ApiClient {
  final String base;
  final TokenStore tokens;
  void Function()? onUnauthorized;

  /// Called after a successful token refresh with the new access token, so
  /// callers (e.g. the realtime socket) can re-authenticate with a fresh token
  /// instead of clinging to the one they connected with.
  void Function(String accessToken)? onTokenRefreshed;

  /// In-flight refresh, shared by all concurrent callers so a burst of 401s
  /// triggers exactly one refresh rather than a storm that revokes each other's
  /// single-use refresh tokens.
  Future<bool>? _refreshing;

  /// Injectable so tests can supply a MockClient; defaults to a real client.
  final http.Client _http;

  ApiClient(this.base, this.tokens,
      {this.onUnauthorized, this.onTokenRefreshed, http.Client? httpClient})
      : _http = httpClient ?? http.Client();

  Future<dynamic> get(String path) => _send('GET', path);
  Future<dynamic> post(String path, [Map<String, dynamic>? body]) => _send('POST', path, body);

  Future<dynamic> _send(String method, String path, [Map<String, dynamic>? body, bool retried = false]) async {
    late http.Response res;
    try {
      res = await _raw(method, path, body);
    } catch (e) {
      throw ApiException(0, e.toString());
    }

    // Only try to refresh when we actually have a session (not on the login
    // screen) and haven't already retried this request.
    if (res.statusCode == 401 && tokens.access != null && !retried) {
      if (await _refresh()) {
        return _send(method, path, body, true);
      }
      // _refresh() already cleared the session and notified once on failure.
      throw ApiException(401, res.body);
    }
    return _handle(res);
  }

  Future<http.Response> _raw(String method, String path, Map<String, dynamic>? body) {
    final uri = Uri.parse('$base$path');
    final headers = <String, String>{
      'Content-Type': 'application/json',
      if (tokens.access != null) 'Authorization': 'Bearer ${tokens.access}',
    };
    if (method == 'GET') return _http.get(uri, headers: headers);
    return _http.post(uri, headers: headers, body: body == null ? null : jsonEncode(body));
  }

  /// Single-flight: concurrent callers await the same refresh future.
  Future<bool> _refresh() {
    return _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);
  }

  Future<bool> _doRefresh() async {
    final rt = tokens.refresh;
    if (rt != null) {
      try {
        final res = await _http.post(
          Uri.parse('$base/auth/refresh'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({'refreshToken': rt}),
        );
        if (res.statusCode >= 200 && res.statusCode < 300) {
          final d = jsonDecode(res.body) as Map<String, dynamic>;
          final access = d['accessToken'] as String;
          await tokens.setSession(access, d['refreshToken'] as String);
          onTokenRefreshed?.call(access);
          return true;
        }
      } catch (_) {}
    }
    // Refresh is impossible or was rejected: end the session once, here, so a
    // burst of 401s doesn't fire onUnauthorized (and navigate to login) N times.
    await tokens.clear();
    onUnauthorized?.call();
    return false;
  }

  dynamic _handle(http.Response res) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return res.body.isEmpty ? null : jsonDecode(res.body);
    }
    throw ApiException(res.statusCode, res.body);
  }
}
