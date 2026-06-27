import 'api_client.dart';

class BookingsService {
  final ApiClient api;
  BookingsService(this.api);

  Future<void> confirm(String bookingId) async {
    await api.post('/bookings/$bookingId/confirm');
  }
}
