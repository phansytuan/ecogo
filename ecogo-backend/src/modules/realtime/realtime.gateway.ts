import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PresenceService } from './presence.service';

interface SocketUser {
  id: string;
  roles: string[];
}

/**
 * Two real-time channels:
 *  - ride rooms (`ride:<id>`): passengers + the driver of a ride
 *  - dispatch room (`dispatch`): dispatchers, for queue/no_match events
 * Drivers emit `driver:location`; positions go to Redis and fan out to the ride room.
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly presence: PresenceService,
  ) {}

  handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.headers.authorization as string)?.replace('Bearer ', '');
      const payload = this.jwt.verify(token);
      const user: SocketUser = { id: payload.sub, roles: payload.roles ?? [] };
      client.data.user = user;
      if (user.roles.includes('dispatcher') || user.roles.includes('admin')) {
        client.join('dispatch');
      }
    } catch {
      this.logger.warn('Rejected socket: invalid token');
      client.disconnect();
    }
  }

  @SubscribeMessage('ride:join')
  onRideJoin(@ConnectedSocket() client: Socket, @MessageBody() body: { rideId: string }) {
    client.join(`ride:${body.rideId}`);
    return { ok: true };
  }

  @SubscribeMessage('chat:join')
  onChatJoin(@ConnectedSocket() client: Socket, @MessageBody() body: { bookingId: string }) {
    client.join(`chat:${body.bookingId}`);
    return { ok: true };
  }

  @SubscribeMessage('driver:location')
  async onDriverLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { rideId: string; lat: number; lng: number; heading?: number },
  ) {
    const user: SocketUser = client.data.user;
    const loc = { driverId: user.id, lat: body.lat, lng: body.lng, heading: body.heading, at: Date.now() };
    await this.presence.setLocation(loc);
    this.server.to(`ride:${body.rideId}`).emit('ride:location', loc);
    this.server.to('dispatch').emit('driver:location', loc);
    return { ok: true };
  }

  // Server-side emit helpers used by other services.
  emitToRide(rideId: string, event: string, payload: unknown) {
    this.server?.to(`ride:${rideId}`).emit(event, payload);
  }

  emitToDispatch(event: string, payload: unknown) {
    this.server?.to('dispatch').emit(event, payload);
  }

  emitToChat(bookingId: string, event: string, payload: unknown) {
    this.server?.to(`chat:${bookingId}`).emit(event, payload);
  }
}
