import 'package:socket_io_client/socket_io_client.dart' as io;

/// Thin wrapper over socket.io for ride tracking, GPS broadcast, and chat.
class RealtimeService {
  final String wsBase;
  io.Socket? _socket;

  RealtimeService(this.wsBase);

  void connect(String token) {
    disposeSocket();
    _socket = io.io(
      wsBase,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .enableReconnection()
          .disableAutoConnect()
          .build(),
    );
    _socket!.connect();
  }

  void joinRide(String rideId) => _socket?.emit('ride:join', {'rideId': rideId});
  void joinChat(String bookingId) => _socket?.emit('chat:join', {'bookingId': bookingId});

  void emitDriverLocation(String rideId, double lat, double lng) =>
      _socket?.emit('driver:location', {'rideId': rideId, 'lat': lat, 'lng': lng});

  void onRideLocation(void Function(Map<String, dynamic>) cb) =>
      _socket?.on('ride:location', (d) => cb(Map<String, dynamic>.from(d as Map)));
  void onChatMessage(void Function(Map<String, dynamic>) cb) =>
      _socket?.on('chat:message', (d) => cb(Map<String, dynamic>.from(d as Map)));

  void off(String event) => _socket?.off(event);

  void disposeSocket() {
    _socket?.dispose();
    _socket = null;
  }

  void dispose() => disposeSocket();
}
