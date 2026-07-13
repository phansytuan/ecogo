import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { isUUID } from "class-validator";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { DatabaseService } from "../../database/database.service";
import { PresenceService } from "./presence.service";

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
const WS_ORIGINS = (
  process.env.CORS_ORIGINS ?? "http://localhost:5173,http://localhost:3000"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

@WebSocketGateway({ cors: { origin: WS_ORIGINS, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly presence: PresenceService,
    private readonly db: DatabaseService,
  ) {}

  handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.headers.authorization as string)?.replace(
          "Bearer ",
          "",
        );
      const payload = this.jwt.verify(token);
      const user: SocketUser = { id: payload.sub, roles: payload.roles ?? [] };
      client.data.user = user;
      if (user.roles.includes("dispatcher") || user.roles.includes("admin")) {
        client.join("dispatch");
      }
    } catch {
      this.logger.warn("Rejected socket: invalid token");
      client.disconnect();
    }
  }

  @SubscribeMessage("ride:join")
  async onRideJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { rideId: string },
  ) {
    const user: SocketUser | undefined = client.data.user;
    if (!user || !isUUID(body?.rideId))
      return { ok: false, error: "forbidden" };
    const access = await this.db.one<{ allowed: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM rides r
         WHERE r.id = $1 AND (
           r.driver_id = $2 OR EXISTS (
             SELECT 1 FROM bookings b
             WHERE b.ride_id = r.id AND b.passenger_id = $2
               AND b.status = ANY($3::text[])
           )
         )
       ) AS allowed`,
      [body.rideId, user.id, ["matched", "confirmed", "ongoing"]],
    );
    if (!access?.allowed) return { ok: false, error: "forbidden" };
    client.join(`ride:${body.rideId}`);
    return { ok: true };
  }

  @SubscribeMessage("ride:leave")
  onRideLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { rideId: string },
  ) {
    if (isUUID(body?.rideId)) client.leave(`ride:${body.rideId}`);
    return { ok: true };
  }

  @SubscribeMessage("chat:join")
  async onChatJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { bookingId: string },
  ) {
    const user: SocketUser | undefined = client.data.user;
    if (!user || !isUUID(body?.bookingId))
      return { ok: false, error: "forbidden" };
    const access = await this.db.one<{ allowed: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM bookings b LEFT JOIN rides r ON r.id = b.ride_id
         WHERE b.id = $1 AND (b.passenger_id = $2 OR r.driver_id = $2)
       ) AS allowed`,
      [body.bookingId, user.id],
    );
    if (!access?.allowed) return { ok: false, error: "forbidden" };
    client.join(`chat:${body.bookingId}`);
    return { ok: true };
  }

  @SubscribeMessage("chat:leave")
  onChatLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { bookingId: string },
  ) {
    if (isUUID(body?.bookingId)) client.leave(`chat:${body.bookingId}`);
    return { ok: true };
  }

  @SubscribeMessage("driver:location")
  async onDriverLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { rideId: string; lat: number; lng: number; heading?: number },
  ) {
    const user: SocketUser | undefined = client.data.user;
    if (
      !user ||
      !isUUID(body?.rideId) ||
      !Number.isFinite(body?.lat) ||
      !Number.isFinite(body?.lng) ||
      body.lat < -90 ||
      body.lat > 90 ||
      body.lng < -180 ||
      body.lng > 180
    ) {
      return { ok: false, error: "forbidden" };
    }
    const access = await this.db.one<{ allowed: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM rides
         WHERE id = $1 AND driver_id = $2 AND status = ANY($3::text[])
       ) AS allowed`,
      [body.rideId, user.id, ["open", "full"]],
    );
    if (!access?.allowed) return { ok: false, error: "forbidden" };
    const loc = {
      driverId: user.id,
      lat: body.lat,
      lng: body.lng,
      heading: body.heading,
      at: Date.now(),
    };
    await this.presence.setLocation(loc);
    this.server.to(`ride:${body.rideId}`).emit("ride:location", loc);
    this.server.to("dispatch").emit("driver:location", loc);
    return { ok: true };
  }

  // Server-side emit helpers used by other services.
  emitToRide(rideId: string, event: string, payload: unknown) {
    this.server?.to(`ride:${rideId}`).emit(event, payload);
  }

  emitToDispatch(event: string, payload: unknown) {
    this.server?.to("dispatch").emit(event, payload);
  }

  emitToChat(bookingId: string, event: string, payload: unknown) {
    this.server?.to(`chat:${bookingId}`).emit(event, payload);
  }
}
