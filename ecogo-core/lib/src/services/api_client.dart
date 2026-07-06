import 'dart:convert';
import 'package:http/http.dart' as http;
import 'token_store.dart';

class ApiException implements Exception {
  final int status;
  final String body;
  ApiException(this.status, this.body);

  /// A short, user-friendly message for SnackBars.
  String get friendly {
    if (status == 401) return 'Phiên đăng nhập đã hết hạn';
    if (status == 0) return 'Không có kết nối mạng';
    try {
      final decoded = jsonDecode(body);
      if (decoded is Map && decoded['message'] != null) {
        final m = decoded['message'];
        return m is List ? m.join(', ') : m.toString();
      }
    } catch (_) {}
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
  void Function()? onUnauthorized;

  ApiClient(this.base, this.tokens, {this.onUnauthorized});

  Future<dynamic> get(String path) => _send('GET', path);
  Future<dynamic> post(String path, [Map<String, dynamic>? body]) => _send('POST', path, body);

  Future<dynamic> _send(String method, String path, [Map<String, dynamic>? body, bool retried = false]) async {
    late http.Response res;
    try {
      res = await _raw(method, path, body);
    } catch (e) {
      throw ApiException(0, e.toString());
    }

    if (res.statusCode == 401 && tokens.access != null) {
      if (!retried && await _refresh()) {
        return _send(method, path, body, true);
      }
      await tokens.clear();
      onUnauthorized?.call();
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
    if (method == 'GET') return http.get(uri, headers: headers);
    return http.post(uri, headers: headers, body: body == null ? null : jsonEncode(body));
  }

  Future<bool> _refresh() async {
    final rt = tokens.refresh;
    if (rt == null) return false;
    try {
      final res = await http.post(
        Uri.parse('$base/auth/refresh'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'refreshToken': rt}),
      );
      if (res.statusCode >= 200 && res.statusCode < 300) {
        final d = jsonDecode(res.body) as Map<String, dynamic>;
        await tokens.setSession(d['accessToken'] as String, d['refreshToken'] as String);
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
