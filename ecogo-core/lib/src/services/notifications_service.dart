import 'api_client.dart';

class NotificationsService {
  final ApiClient api;
  NotificationsService(this.api);

  /// Register this device's push token so the server can reach the user when
  /// the app is closed (ride matched, driver cancelled, etc.).
  Future<void> registerToken(String token, {String? platform}) async {
    await api.post('/notifications/token', {
      'token': token,
      if (platform != null) 'platform': platform,
    });
  }
}
