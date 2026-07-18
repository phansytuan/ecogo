import 'dart:convert';

import 'package:ecogo_core/ecogo_core.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

Future<TokenStore> makeTokens({String? access, String? refresh}) async {
  final kv = InMemorySecureKV();
  if (access != null) await kv.write('token', access);
  if (refresh != null) await kv.write('refresh', refresh);
  return TokenStore.create(storage: kv);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('ApiClient token refresh', () {
    test('a burst of concurrent 401s triggers exactly one refresh', () async {
      final tokens = await makeTokens(access: 'old', refresh: 'rt1');
      var refreshCalls = 0;

      final mock = MockClient((req) async {
        if (req.url.path.endsWith('/auth/refresh')) {
          refreshCalls++;
          return http.Response(
              jsonEncode({'accessToken': 'new', 'refreshToken': 'rt2'}), 200);
        }
        // Protected endpoint: 401 with the stale token, 200 once refreshed.
        return req.headers['Authorization'] == 'Bearer new'
            ? http.Response(jsonEncode({'ok': true}), 200)
            : http.Response(jsonEncode({'message': 'Unauthorized'}), 401);
      });

      final api = ApiClient('http://x', tokens, httpClient: mock);
      final results =
          await Future.wait([api.get('/a'), api.get('/b'), api.get('/c')]);

      expect(refreshCalls, 1, reason: 'refresh must be single-flight');
      expect(results.length, 3);
      expect(tokens.access, 'new', reason: 'rotated token persisted');
    });

    test('failed refresh clears the session and notifies once', () async {
      final tokens = await makeTokens(access: 'old', refresh: 'badrt');
      var unauthorized = 0;

      final mock = MockClient((req) async => http.Response(
          jsonEncode({'message': 'Unauthorized'}),
          401)); // both protected calls and /auth/refresh fail

      final api = ApiClient('http://x', tokens,
          httpClient: mock, onUnauthorized: () => unauthorized++);
      await Future.wait([
        api.get('/a').catchError((_) => null),
        api.get('/b').catchError((_) => null),
        api.get('/c').catchError((_) => null),
      ]);

      expect(unauthorized, 1,
          reason: 'one logout for a burst, not one per request');
      expect(tokens.access, isNull);
      expect(tokens.refresh, isNull);
    });

    test('successful refresh notifies onTokenRefreshed with the new token',
        () async {
      final tokens = await makeTokens(access: 'old', refresh: 'rt1');
      String? refreshed;

      final mock = MockClient((req) async {
        if (req.url.path.endsWith('/auth/refresh')) {
          return http.Response(
              jsonEncode({'accessToken': 'new', 'refreshToken': 'rt2'}), 200);
        }
        return req.headers['Authorization'] == 'Bearer new'
            ? http.Response('{}', 200)
            : http.Response(jsonEncode({'message': 'Unauthorized'}), 401);
      });

      final api = ApiClient('http://x', tokens,
          httpClient: mock, onTokenRefreshed: (t) => refreshed = t);
      await api.get('/a');

      expect(refreshed, 'new');
    });

    test('no refresh is attempted when there is no session (login screen)',
        () async {
      final tokens = await makeTokens(); // no tokens
      var refreshCalls = 0;
      final mock = MockClient((req) async {
        if (req.url.path.endsWith('/auth/refresh')) refreshCalls++;
        return http.Response(jsonEncode({'message': 'Invalid or expired code'}), 401);
      });
      final api = ApiClient('http://x', tokens, httpClient: mock);

      await expectLater(api.post('/auth/verify-otp', {'code': 'x'}),
          throwsA(isA<ApiException>()));
      expect(refreshCalls, 0, reason: 'never refresh without an existing session');
    });
  });

  group('ApiException.friendly', () {
    test('bare Unauthorized 401 -> friendly session-expired copy', () {
      final e = ApiException(401, jsonEncode({'message': 'Unauthorized'}));
      expect(e.friendly, 'Phiên đăng nhập đã hết hạn');
    });

    test('401 with a domain message -> surfaces that message', () {
      final e = ApiException(401, jsonEncode({'message': 'Invalid or expired code'}));
      expect(e.friendly, 'Invalid or expired code');
    });

    test('network error (status 0) -> no-connection copy', () {
      expect(ApiException(0, 'SocketException').friendly, 'Không có kết nối mạng');
    });

    test('validation list message is joined', () {
      final e = ApiException(400, jsonEncode({
        'message': ['phone must be a string', 'phone must be a valid VN number']
      }));
      expect(e.friendly, 'phone must be a string, phone must be a valid VN number');
    });
  });
}
