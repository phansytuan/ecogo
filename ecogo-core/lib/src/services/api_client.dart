import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'token_store.dart';

class ApiException implements Exception {
  final int status;
  final String body;
  ApiException(this.status, this.body);

  String? get _message {
    try {
      final decoded = jsonDecode(body);
      if (decoded is Map && decoded['message'] != null) {
        final m = decoded['message'];
        return m is List ? m.join(', ') : m.toString();
      }
    } catch (_) {}
    return null;
  }

  /// A short, user-friendly message for SnackBars.
  String get friendly {
    if (status == 401) {
      final m = _message;
      // Surface domain-specific 401 messages (e.g. OTP verification), but
      // treat the generic "Unauthorized" as a session-expired prompt.
      if (m != null && m != 'Unauthorized' && m.isNotEmpty) return m;
      return 'Phiên đăng nhập đã hết hạn';
    }
    if (status == 0) return 'Không có kết nối mạng';
    if (status == -1) return 'Kết nối quá lâu, vui lòng thử lại';
    final m = _message;
    if (m != null && m.isNotEmpty) return m;
    return 'Đã có lỗi xảy ra ($status)';
  }

  @override
  String toString() => 'API $status: $body';
}

/// HTTP client with transparent access-token refresh: on a 401 it tries the
/// refresh token once, then retries the original request.
class ApiClient {
  final String base;
  final TokenStore tokens;
  final http.Client? httpClient;
  void Function()? onUnauthorized;
  /// Called after the access token is silently refreshed, so long-lived
  /// connections (e.g. the socket) can re-auth with the new token.
  void Function(String token)? onTokenRefreshed;

  ApiClient(this.base, this.tokens,
      {this.httpClient, this.onUnauthorized, this.onTokenRefreshed});

  Future<bool>? _refreshFuture;
  bool _unauthorizedNotified = false;

  Future<void> _notifyUnauthorized() async {
    if (_unauthorizedNotified) return;
    _unauthorizedNotified = true;
    await tokens.clear();
    onUnauthorized?.call();
  }

  Future<dynamic> get(String path) => _send('GET', path);
  Future<dynamic> post(String path, [Map<String, dynamic>? body]) => _send('POST', path, body);

  static const _timeout = Duration(seconds: 20);

  Future<dynamic> _send(String method, String path, [Map<String, dynamic>? body, bool retried = false]) async {
    late http.Response res;
    try {
      res = await _raw(method, path, body).timeout(_timeout);
    } on TimeoutException {
      throw ApiException(-1, 'timeout');
    } catch (e) {
      throw ApiException(0, e.toString());
    }

    if (res.statusCode == 401 && tokens.access != null) {
      if (!retried && await _refresh()) {
        return _send(method, path, body, true);
      }
      await _notifyUnauthorized();
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
    final client = httpClient;
    if (method == 'GET') {
      return client?.get(uri, headers: headers) ?? http.get(uri, headers: headers);
    }
    return client?.post(uri, headers: headers, body: body == null ? null : jsonEncode(body)) ??
        http.post(uri, headers: headers, body: body == null ? null : jsonEncode(body));
  }

  Future<bool> _refresh() async {
    if (_refreshFuture != null) return _refreshFuture!;
    _refreshFuture = _refreshOnce();
    try {
      return await _refreshFuture!;
    } finally {
      _refreshFuture = null;
    }
  }

  Future<bool> _refreshOnce() async {
    final rt = tokens.refresh;
    if (rt == null) return false;
    try {
      final uri = Uri.parse('$base/auth/refresh');
      final headers = {'Content-Type': 'application/json'};
      final body = jsonEncode({'refreshToken': rt});
      final res = await (httpClient?.post(uri, headers: headers, body: body) ??
              http.post(uri, headers: headers, body: body))
          .timeout(_timeout);
      if (res.statusCode >= 200 && res.statusCode < 300) {
        final d = jsonDecode(res.body) as Map<String, dynamic>;
        final access = d['accessToken'] as String;
        await tokens.setSession(access, d['refreshToken'] as String);
        _unauthorizedNotified = false;
        onTokenRefreshed?.call(access);
        return true;
      }
    } catch (_) {}
    return false;
  }

  dynamic _handle(http.Response res) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return res.body.isEmpty ? null : jsonDecode(res.body);
    }
    throw ApiException(res.statusCode, res.body);
  }
}
