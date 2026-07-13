import 'api_client.dart';

class RatingsService {
  final ApiClient api;
  RatingsService(this.api);

  /// Rate the counterpart on a completed booking (1–5, optional comment).
  Future<void> rate(String bookingId, int score, {String? comment}) async {
    await api.post('/ratings', {
      'bookingId': bookingId,
      'score': score,
      if (comment != null && comment.trim().isNotEmpty) 'comment': comment.trim(),
    });
  }
}
