import 'package:socket_io_client/socket_io_client.dart' as io;

/// Thin wrapper over socket.io for ride tracking, GPS broadcast, and chat.
class RealtimeService {
  final String wsBase;
  io.Socket? _socket;
  String? _token;
  final Set<String> _rideRooms = {};
  final Set<String> _chatRooms = {};
  void Function(Map<String, dynamic>)? _onRideLocation;
  void Function(Map<String, dynamic>)? _onChatMessage;
  void Function(String event, Map<String, dynamic>)? _onRideEvent;

  RealtimeService(this.wsBase);

  void connect(String token) {
    _token = token;
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
    _bindListeners();
    // Re-join any active rooms after a reconnect (network drop, token refresh).
    _socket!.onConnect((_) {
      for (final r in _rideRooms) {
        _socket?.emit('ride:join', {'rideId': r});
      }
      for (final c in _chatRooms) {
        _socket?.emit('chat:join', {'bookingId': c});
      }
    });
    _socket!.connect();
  }

  void _bindListeners() {
    final onLoc = _onRideLocation;
    if (onLoc != null) {
      _socket?.on('ride:location', (d) => onLoc(Map<String, dynamic>.from(d as Map)));
    }
    final onMsg = _onChatMessage;
    if (onMsg != null) {
      _socket?.on('chat:message', (d) => onMsg(Map<String, dynamic>.from(d as Map)));
    }
    final onRide = _onRideEvent;
    if (onRide != null) {
      for (final ev in const ['ride.cancelled', 'ride.completed', 'booking.cancelled', 'seatmap.updated']) {
        _socket?.on(ev, (d) => onRide(ev, Map<String, dynamic>.from(d as Map)));
      }
    }
  }

  /// Reconnect with a freshly refreshed token, preserving joined rooms.
  void reauth(String token) {
    if (token == _token && _socket != null && _socket!.connected) return;
    connect(token);
  }

  void joinRide(String rideId) {
    _rideRooms.add(rideId);
    _socket?.emit('ride:join', {'rideId': rideId});
  }

  void joinChat(String bookingId) {
    _chatRooms.add(bookingId);
    _socket?.emit('chat:join', {'bookingId': bookingId});
  }

  void emitDriverLocation(String rideId, double lat, double lng) =>
      _socket?.emit('driver:location', {'rideId': rideId, 'lat': lat, 'lng': lng});

  void onRideLocation(void Function(Map<String, dynamic>) cb) {
    _onRideLocation = cb;
    _socket?.on('ride:location', (d) => cb(Map<String, dynamic>.from(d as Map)));
  }

  void onChatMessage(void Function(Map<String, dynamic>) cb) {
    _onChatMessage = cb;
    _socket?.on('chat:message', (d) => cb(Map<String, dynamic>.from(d as Map)));
  }

  /// Ride lifecycle events (cancelled / completed / booking.cancelled) delivered
  /// to whoever is in the ride room — lets a tracking screen react when the
  /// driver cancels or finishes.
  void onRideEvent(void Function(String event, Map<String, dynamic>) cb) {
    _onRideEvent = cb;
    for (final ev in const ['ride.cancelled', 'ride.completed', 'booking.cancelled', 'seatmap.updated']) {
      _socket?.on(ev, (d) => cb(ev, Map<String, dynamic>.from(d as Map)));
    }
  }

  void off(String event) {
    if (event == 'ride:location') _onRideLocation = null;
    if (event == 'chat:message') _onChatMessage = null;
    if (event == 'ride:events') {
      _onRideEvent = null;
      for (final ev in const ['ride.cancelled', 'ride.completed', 'booking.cancelled', 'seatmap.updated']) {
        _socket?.off(ev);
      }
      return;
    }
    _socket?.off(event);
  }

  void disposeSocket() {
    _socket?.dispose();
    _socket = null;
  }

  void leaveRooms() {
    _rideRooms.clear();
    _chatRooms.clear();
    _onRideLocation = null;
    _onChatMessage = null;
    _onRideEvent = null;
  }

  void dispose() => disposeSocket();
}
