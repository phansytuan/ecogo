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

  /// Swap in a freshly-refreshed access token. The gateway verifies the JWT on
  /// every (re)connect and disconnects on failure, so without this a socket that
  /// reconnects after the original token expires would be rejected and go silent
  /// (GPS tracking / chat stop). Updating `auth` means the next reconnect sends
  /// a valid token; we don't force a reconnect here so active room joins survive.
  void updateToken(String token) {
    _socket?.auth = {'token': token};
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
