class Message {
  final String id;
  final String senderId;
  final String body;
  final DateTime createdAt;

  Message({
    required this.id,
    required this.senderId,
    required this.body,
    required this.createdAt,
  });

  factory Message.fromJson(Map<String, dynamic> j) => Message(
        id: j['id'] as String,
        senderId: j['sender_id'] as String,
        body: j['body'] as String,
        createdAt: DateTime.parse(j['created_at'] as String),
      );
}
