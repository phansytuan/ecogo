import 'package:socket_io_client/socket_io_client.dart' as io;

class RealtimeService {
  final String wsBase;
  io.Socket? _socket;

  RealtimeService(this.wsBase);

  void connect(String token) {
    _socket = io.io(
      wsBase,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .disableAutoConnect()
          .build(),
    );
    _socket!.connect();
  }

  void emitDriverLocation(String rideId, double lat, double lng) =>
      _socket?.emit('driver:location', {'rideId': rideId, 'lat': lat, 'lng': lng});

  void joinChat(String bookingId) =>
      _socket?.emit('chat:join', {'bookingId': bookingId});

  void onChatMessage(void Function(Map<String, dynamic>) cb) =>
      _socket?.on('chat:message', (d) => cb(Map<String, dynamic>.from(d as Map)));

  void off(String event) => _socket?.off(event);

  void dispose() {
    _socket?.dispose();
    _socket = null;
  }
}
