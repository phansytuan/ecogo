import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../database/database.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { VehiclesService } from '../vehicles/vehicles.service';
import {
  DIRECTIONS_PROVIDER,
  DirectionsProvider,
} from './directions/directions.provider';
import { CreateRideDto } from './rides.dto';

@Injectable()
export class RidesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly vehicles: VehiclesService,
    private readonly realtime: RealtimeGateway,
    private readonly events: EventEmitter2,
    @Inject(DIRECTIONS_PROVIDER) private readonly directions: DirectionsProvider,
  ) {}

  async create(driverId: string, dto: CreateRideDto) {
    const vehicle = await this.vehicles.findOwned(dto.vehicleId, driverId);
    if (!vehicle) throw new ForbiddenException('Vehicle not found or not owned by you');

    const route = await this.directions.route(
      { lat: dto.origin.lat, lng: dto.origin.lng },
      { lat: dto.dest.lat, lng: dto.dest.lng },
    );
    const geojson = JSON.stringify({ type: 'LineString', coordinates: route.coordinates });

    return this.db.one(
      `INSERT INTO rides
         (driver_id, vehicle_id, origin_label, dest_label, route, duration_s,
          departure_time, total_seats, available_seats, price_per_seat)
       VALUES ($1,$2,$3,$4, ST_SetSRID(ST_GeomFromGeoJSON($5),4326), $6,$7,$8,$8,$9)
       RETURNING id, driver_id, vehicle_id, origin_label, dest_label, duration_s,
                 departure_time, total_seats, available_seats, price_per_seat, status,
                 ST_AsGeoJSON(route) AS route`,
      [
        driverId,
        dto.vehicleId,
        dto.origin.label ?? null,
        dto.dest.label ?? null,
        geojson,
        route.durationS,
        dto.departureTime,
        dto.totalSeats,
        dto.pricePerSeat ?? null,
      ],
    );
  }

  findById(id: string) {
    return this.db.one(
      `SELECT id, driver_id, vehicle_id, origin_label, dest_label, duration_s,
              departure_time, total_seats, available_seats, price_per_seat, status,
              ST_AsGeoJSON(route) AS route
       FROM rides WHERE id = $1`,
      [id],
    );
  }

  listByDriver(driverId: string) {
    return this.db.query(
      `SELECT id, origin_label, dest_label, departure_time, available_seats,
              total_seats, price_per_seat, status
       FROM rides WHERE driver_id = $1 ORDER BY departure_time DESC`,
      [driverId],
    );
  }

  async bookingsForRide(rideId: string, driverId: string) {
    const owns = await this.db.one(`SELECT 1 FROM rides WHERE id = $1 AND driver_id = $2`, [
      rideId,
      driverId,
    ]);
    if (!owns) throw new ForbiddenException('Not your ride');
    return this.db.query(
      `SELECT b.id, b.passenger_id, u.full_name AS passenger_name,
              b.pickup_label, b.dropoff_label, b.seats, b.fare, b.status
       FROM bookings b JOIN users u ON u.id = b.passenger_id
       WHERE b.ride_id = $1 ORDER BY b.created_at ASC`,
      [rideId],
    );
  }

  async cancel(rideId: string, driverId: string) {
    const result = await this.db.tx(async (client) => {
      const ride = (
        await client.query(`SELECT id, driver_id, status FROM rides WHERE id = $1 FOR UPDATE`, [
          rideId,
        ])
      ).rows[0];
      if (!ride) throw new NotFoundException('Ride not found');
      if (ride.driver_id !== driverId) throw new ForbiddenException('Not your ride');
      if (ride.status === 'cancelled' || ride.status === 'completed') {
        throw new ConflictException(`Ride already ${ride.status}`);
      }
      // Cancel every still-active booking and capture passengers to notify.
      const affected = (
        await client.query(
          `UPDATE bookings SET status = 'cancelled'
           WHERE ride_id = $1 AND status IN ('matched','confirmed')
           RETURNING id, passenger_id`,
          [rideId],
        )
      ).rows;
      await client.query(`UPDATE rides SET status = 'cancelled', available_seats = 0 WHERE id = $1`, [
        rideId,
      ]);
      return {
        rideId,
        driverId,
        status: 'cancelled',
        bookings: affected.map((b: { id: string; passenger_id: string }) => ({
          id: b.id,
          passengerId: b.passenger_id,
        })),
      };
    });

    this.realtime.emitToRide(rideId, 'ride.cancelled', result);
    this.realtime.emitToDispatch('ride.cancelled', result);
    this.events.emit('ride.cancelled', result);
    return result;
  }
}
