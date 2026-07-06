import '../models/message.dart';
import 'api_client.dart';

class ChatService {
  final ApiClient api;
  ChatService(this.api);

  Future<List<Message>> list(String bookingId) async {
    final r = await api.get('/chat/$bookingId/messages');
    return (r as List).map((e) => Message.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Message> send(String bookingId, String body) async {
    final r = await api.post('/chat/$bookingId/messages', {'body': body});
    return Message.fromJson(r as Map<String, dynamic>);
  }
}
