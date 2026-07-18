import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../database/database.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { VehiclesService } from '../vehicles/vehicles.service';
import {
  DIRECTIONS_PROVIDER,
  DirectionsProvider,
} from './directions/directions.provider';
import { CreateRideDto } from './rides.dto';
import { quoteFare } from '../pricing/pricing';
import { polylineKm } from './geo';
import { earliestNextDeparture } from './scheduling';
import { buildItinerary, etaOffsetsFromLegs } from './itinerary';
import { canAcceptCharter, isCharterAvailable } from './charter';
import { checkDeparture } from './departure';
import { seatLayout } from './seat-layout';
import { recomputeRideAvailability } from '../matching/availability';

const RIDE_START_EARLY_MIN = 30;

@Injectable()
export class RidesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly vehicles: VehiclesService,
    private readonly realtime: RealtimeGateway,
    private readonly events: EventEmitter2,
    private readonly config: ConfigService,
    @Inject(DIRECTIONS_PROVIDER) private readonly directions: DirectionsProvider,
  ) {}

  async create(driverId: string, dto: CreateRideDto) {
    const vehicle = await this.vehicles.findOwned(dto.vehicleId, driverId);
    if (!vehicle) throw new ForbiddenException('Vehicle not found or not owned by you');

    const check = checkDeparture(new Date(dto.departureTime), new Date(), {
      maxBackdateMin: this.config.get<number>('rides.maxBackdateMin') ?? 60,
      maxAheadDays: this.config.get<number>('rides.maxAheadDays') ?? 30,
    });
    if (!check.ok) throw new BadRequestException(check.message);

    const route = await this.directions.route(
      { lat: dto.origin.lat, lng: dto.origin.lng },
      { lat: dto.dest.lat, lng: dto.dest.lng },
    );
    const geojson = JSON.stringify({ type: 'LineString', coordinates: route.coordinates });
    const km = polylineKm(route.coordinates);
    const distanceM = Math.round(km * 1000);
    const pricePerSeat = dto.pricePerSeat ?? quoteFare(km);

    await this.assertSchedulingGap(driverId, new Date(dto.departureTime), route.durationS, km);

    // Seats become addressable positions from the vehicle's physical layout.
    const layout = seatLayout(vehicle.type);
    const sellable = layout.passengerSeatIds.length;
    // The ride's sellable seat count is the layout's passenger count (never more
    // than the vehicle physically has). A driver may still request fewer via
    // totalSeats, in which case we cap.
    const totalSeats = Math.min(dto.totalSeats ?? sellable, sellable);

    return this.db.tx(async (client) => {
      const ride = (
        await client.query(
          `INSERT INTO rides
             (driver_id, vehicle_id, origin_label, dest_label, route, duration_s,
              departure_time, total_seats, available_seats, price_per_seat, distance_m)
           VALUES ($1,$2,$3,$4, ST_SetSRID(ST_GeomFromGeoJSON($5),4326), $6,$7,$8,$8,$9,$10)
           RETURNING id, driver_id, vehicle_id, origin_label, dest_label, duration_s,
                     departure_time, total_seats, available_seats,
                     price_per_seat::float8 AS price_per_seat, distance_m, status,
                     ST_AsGeoJSON(route) AS route`,
          [
            driverId,
            dto.vehicleId,
            dto.origin.label ?? null,
            dto.dest.label ?? null,
            geojson,
            route.durationS,
            dto.departureTime,
            totalSeats,
            pricePerSeat,
            distanceM,
          ],
        )
      ).rows[0];

      // Seed the seat map. Only the first `totalSeats` passenger seats are
      // offered; any beyond the requested count are omitted so they can't be sold.
      const offered = layout.passengerSeatIds.slice(0, totalSeats);
      const flat = layout.rows.flat().filter((c) => offered.includes(c.id));
      for (const c of flat) {
        await client.query(
          `INSERT INTO ride_seats (ride_id, seat_id, row_num, col_num, status)
           VALUES ($1,$2,$3,$4,'free')`,
          [ride.id, c.id, c.row, c.col],
        );
      }
      return ride;
    });
  }

  /**
   * The seat map for a ride: every seat position with its status
   * (free / locked / booked). Drives the driver's visual seat map and the
   * passenger's seat picker. Locked seats are the driver's offline reservations.
   */
  async seatMap(rideId: string) {
    const ride = await this.db.one<{ vehicle_type: string }>(
      `SELECT v.type AS vehicle_type
       FROM rides r JOIN vehicles v ON v.id = r.vehicle_id
       WHERE r.id = $1`,
      [rideId],
    );
    if (!ride) throw new NotFoundException('Ride not found');

    const seats = await this.db.query<{
      seat_id: string;
      row_num: number;
      col_num: number;
      status: string;
      booking_id: string | null;
      note: string | null;
    }>(
      `SELECT seat_id, row_num, col_num, status, booking_id, note
       FROM ride_seats WHERE ride_id = $1
       ORDER BY row_num, col_num`,
      [rideId],
    );

    const layout = seatLayout(ride.vehicle_type);
    const byId = new Map(seats.map((s) => [s.seat_id, s]));
    // Return the full physical layout (incl. the driver seat) annotated with
    // sellable status, so the app can render the real vehicle shape.
    const rows = layout.rows.map((row) =>
      row.map((c) => {
        const s = byId.get(c.id);
        return {
          seatId: c.id,
          row: c.row,
          col: c.col,
          kind: c.kind,
          // Driver seat and any non-offered seat are 'unavailable' for sale.
          status: c.kind === 'driver' ? 'driver' : s ? s.status : 'unavailable',
          note: s?.note ?? null,
        };
      }),
    );
    return {
      rideId,
      vehicleType: ride.vehicle_type,
      rows,
      freeSeatIds: seats.filter((s) => s.status === 'free').map((s) => s.seat_id),
    };
  }

  /** Driver locks seats for passengers booking directly (offline). */
  async lockSeats(rideId: string, driverId: string, seatIds: string[], note?: string) {
    const owns = await this.db.one(
      `SELECT 1 FROM rides WHERE id = $1 AND driver_id = $2`,
      [rideId, driverId],
    );
    if (!owns) throw new ForbiddenException('Not your ride');

    return this.db.tx(async (client) => {
      const locked: string[] = [];
      for (const seatId of seatIds) {
        const r = await client.query(
          `UPDATE ride_seats SET status = 'locked', note = $3, updated_at = now()
           WHERE ride_id = $1 AND seat_id = $2 AND status = 'free'
           RETURNING seat_id`,
          [rideId, seatId, note ?? null],
        );
        if (r.rowCount === 0) {
          throw new ConflictException(`Seat ${seatId} is not free`);
        }
        locked.push(seatId);
      }
      await this.recomputeAvailability(client, rideId);
      const map = await this.seatMapTx(client, rideId);
      this.realtime.emitToRide(rideId, 'seatmap.updated', { rideId });
      return { locked, seatMap: map };
    });
  }

  /** Driver frees previously locked seats. */
  async unlockSeats(rideId: string, driverId: string, seatIds: string[]) {
    const owns = await this.db.one(
      `SELECT 1 FROM rides WHERE id = $1 AND driver_id = $2`,
      [rideId, driverId],
    );
    if (!owns) throw new ForbiddenException('Not your ride');

    return this.db.tx(async (client) => {
      for (const seatId of seatIds) {
        await client.query(
          `UPDATE ride_seats SET status = 'free', note = NULL, updated_at = now()
           WHERE ride_id = $1 AND seat_id = $2 AND status = 'locked'`,
          [rideId, seatId],
        );
      }
      await this.recomputeAvailability(client, rideId);
      this.realtime.emitToRide(rideId, 'seatmap.updated', { rideId });
      return this.seatMapTx(client, rideId);
    });
  }

  /** Delegate availability accounting to the shared segment-capacity helper. */
  private async recomputeAvailability(client: import('pg').PoolClient, rideId: string) {
    await recomputeRideAvailability(client, rideId);
  }

  private async seatMapTx(client: import('pg').PoolClient, rideId: string) {
    const seats = await client.query(
      `SELECT seat_id, row_num, col_num, status FROM ride_seats
       WHERE ride_id = $1 ORDER BY row_num, col_num`,
      [rideId],
    );
    return seats.rows;
  }

  /** Enforce the minimum rest gap between a driver's consecutive trips. */
  private async assertSchedulingGap(
    driverId: string,
    newDep: Date,
    newDurationS: number,
    newKm: number,
  ) {
    const others = await this.db.query<{
      departure_time: string;
      duration_s: number;
      distance_m: string | null;
      completed_at: string | null;
    }>(
      `SELECT departure_time, duration_s, distance_m, completed_at
       FROM rides WHERE driver_id = $1 AND status NOT IN ('cancelled','expired')`,
      [driverId],
    );
    for (const o of others) {
      const oDep = new Date(o.departure_time);
      const oKm = o.distance_m ? Number(o.distance_m) / 1000 : 0;
      if (oDep.getTime() <= newDep.getTime()) {
        const earliest = earliestNextDeparture({
          departure: oDep,
          durationS: o.duration_s,
          completedAt: o.completed_at ? new Date(o.completed_at) : null,
          km: oKm,
        });
        if (newDep < earliest) {
          throw new ConflictException(
            `Departure too soon after your previous trip. Earliest: ${earliest.toISOString()}`,
          );
        }
      } else {
        const earliest = earliestNextDeparture({
          departure: newDep,
          durationS: newDurationS,
          completedAt: null,
          km: newKm,
        });
        if (oDep < earliest) {
          throw new ConflictException('This trip starts too close before another scheduled trip.');
        }
      }
    }
  }

  /** Suggested price for a route, for the posting form (before any booking). */
  async quote(origin: { lat: number; lng: number }, dest: { lat: number; lng: number }) {
    const route = await this.directions.route(origin, dest);
    const km = polylineKm(route.coordinates);
    return { km: Math.round(km * 10) / 10, durationS: route.durationS, pricePerSeat: quoteFare(km) };
  }

  /**
   * Dynamic route: re-routes the ride through its passengers' actual pickup and
   * dropoff points (ordered along the corridor) and derives each stop's ETA from
   * the provider's real per-leg durations. Recomputed on demand, so it reflects
   * the current passenger list. Falls back to proportional ETAs when the
   * provider returns no leg breakdown.
   */
  async dynamicRoute(rideId: string, driverId: string) {
    const ride = await this.db.one<{
      driver_id: string;
      origin_label: string | null;
      dest_label: string | null;
      departure_time: string;
      duration_s: number;
      route: string;
    }>(
      `SELECT driver_id, origin_label, dest_label, departure_time, duration_s,
              ST_AsGeoJSON(route) AS route
       FROM rides WHERE id = $1`,
      [rideId],
    );
    if (!ride) throw new NotFoundException('Ride not found');
    if (ride.driver_id !== driverId) throw new ForbiddenException('Not your ride');

    const coords: [number, number][] = JSON.parse(ride.route).coordinates;
    const origin = { lng: coords[0][0], lat: coords[0][1] };
    const last = coords[coords.length - 1];
    const dest = { lng: last[0], lat: last[1] };

    const rows = await this.db.query<{
      id: string;
      fp: string;
      fd: string;
      pickup_label: string | null;
      dropoff_label: string | null;
      passenger_name: string | null;
      pickup_lng: number;
      pickup_lat: number;
      dropoff_lng: number;
      dropoff_lat: number;
    }>(
      `SELECT b.id, b.fp, b.fd, b.pickup_label, b.dropoff_label, u.full_name AS passenger_name,
              ST_X(b.pickup) AS pickup_lng, ST_Y(b.pickup) AS pickup_lat,
              ST_X(b.dropoff) AS dropoff_lng, ST_Y(b.dropoff) AS dropoff_lat
       FROM bookings b JOIN users u ON u.id = b.passenger_id
       WHERE b.ride_id = $1 AND b.status IN ('matched','confirmed','ongoing')`,
      [rideId],
    );

    // Intermediate stops, ordered along the corridor.
    const mid = rows
      .flatMap((b) => [
        {
          kind: 'pickup' as const,
          fraction: Number(b.fp),
          label: b.pickup_label,
          bookingId: b.id,
          passengerName: b.passenger_name,
          lat: b.pickup_lat,
          lng: b.pickup_lng,
        },
        {
          kind: 'dropoff' as const,
          fraction: Number(b.fd),
          label: b.dropoff_label,
          bookingId: b.id,
          passengerName: b.passenger_name,
          lat: b.dropoff_lat,
          lng: b.dropoff_lng,
        },
      ])
      .sort((a, b) => a.fraction - b.fraction);

    const route = await this.directions.route(
      origin,
      dest,
      mid.map((m) => ({ lat: m.lat, lng: m.lng })),
    );

    const offsets = etaOffsetsFromLegs(
      mid.length,
      route.legDurationsS,
      route.durationS,
      mid.map((m) => m.fraction),
    );
    const dep = new Date(ride.departure_time).getTime();
    const eta = (offsetS: number) => new Date(dep + offsetS * 1000).toISOString();

    return {
      rideId,
      departureTime: ride.departure_time,
      durationS: route.durationS,
      distanceKm: Math.round(polylineKm(route.coordinates) * 10) / 10,
      geometry: { type: 'LineString', coordinates: route.coordinates },
      stops: [
        { kind: 'origin', label: ride.origin_label, etaOffsetS: 0, eta: eta(0) },
        ...mid.map((m, i) => ({
          kind: m.kind,
          label: m.label,
          bookingId: m.bookingId,
          passengerName: m.passengerName,
          etaOffsetS: offsets[i],
          eta: eta(offsets[i]),
        })),
        {
          kind: 'dest',
          label: ride.dest_label,
          etaOffsetS: route.durationS,
          eta: eta(route.durationS),
        },
      ],
    };
  }

  /** Ordered pickup/dropoff itinerary with ETAs, built from the passenger list. */
  async itinerary(rideId: string, driverId: string) {
    const ride = await this.db.one<{
      driver_id: string;
      origin_label: string | null;
      dest_label: string | null;
      departure_time: string;
      duration_s: number;
    }>(
      `SELECT driver_id, origin_label, dest_label, departure_time, duration_s
       FROM rides WHERE id = $1`,
      [rideId],
    );
    if (!ride) throw new NotFoundException('Ride not found');
    if (ride.driver_id !== driverId) throw new ForbiddenException('Not your ride');

    const bookings = await this.db.query<{
      id: string;
      fp: string;
      fd: string;
      pickup_label: string | null;
      dropoff_label: string | null;
      passenger_name: string | null;
    }>(
      `SELECT b.id, b.fp, b.fd, b.pickup_label, b.dropoff_label, u.full_name AS passenger_name
       FROM bookings b JOIN users u ON u.id = b.passenger_id
       WHERE b.ride_id = $1 AND b.status IN ('matched','confirmed','ongoing')`,
      [rideId],
    );
    const stops = buildItinerary(
      bookings.map((b) => ({
        id: b.id,
        fp: Number(b.fp),
        fd: Number(b.fd),
        pickupLabel: b.pickup_label,
        dropoffLabel: b.dropoff_label,
        passengerName: b.passenger_name,
      })),
      ride.duration_s,
      ride.origin_label,
      ride.dest_label,
    );
    const dep = new Date(ride.departure_time).getTime();
    return {
      rideId,
      departureTime: ride.departure_time,
      stops: stops.map((s) => ({ ...s, eta: new Date(dep + s.etaOffsetS * 1000).toISOString() })),
    };
  }

  async findById(id: string) {
    const ride = await this.db.one(
      `SELECT id, driver_id, vehicle_id, origin_label, dest_label, duration_s,
              departure_time, total_seats, available_seats,
              price_per_seat::float8 AS price_per_seat, distance_m, status,
              ST_AsGeoJSON(route) AS route
       FROM rides WHERE id = $1`,
      [id],
    );
    if (!ride) throw new NotFoundException('Ride not found');
    return ride;
  }

  listByDriver(driverId: string) {
    return this.db.query(
      `SELECT id, origin_label, dest_label, departure_time, available_seats,
              total_seats, price_per_seat::float8 AS price_per_seat, distance_m, charter_opt_out, status
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
    // The driver needs the precise map addresses and, for multi-seat bookings,
    // every traveller they are expected to pick up.
    return this.db.query(
      `SELECT b.id, b.passenger_id, u.full_name AS passenger_name, u.phone AS passenger_phone,
              b.pickup_label, b.dropoff_label, b.pickup_address, b.dropoff_address,
              b.seats, b.fare, b.status,
              b.route_distance_m, b.detour_m, b.detour_pct, b.extra_duration_s,
              COALESCE(
                (SELECT json_agg(json_build_object(
                    'fullName', bp.full_name, 'phone', bp.phone, 'email', bp.email)
                  ORDER BY bp.created_at)
                 FROM booking_passengers bp WHERE bp.booking_id = b.id),
                '[]'::json
              ) AS companions
       FROM bookings b JOIN users u ON u.id = b.passenger_id
       WHERE b.ride_id = $1 ORDER BY b.created_at ASC`,
      [rideId],
    );
  }

  /**
   * Charter status for a ride: available by default while no seat is held,
   * plus the next committed pickup (the constraint the driver must respect).
   */
  async charterStatus(rideId: string, driverId: string) {
    const ride = await this.db.one<{
      driver_id: string;
      status: string;
      charter_opt_out: boolean;
      origin_label: string | null;
      dest_label: string | null;
    }>(
      `SELECT driver_id, status, charter_opt_out, origin_label, dest_label
       FROM rides WHERE id = $1`,
      [rideId],
    );
    if (!ride) throw new NotFoundException('Ride not found');
    if (ride.driver_id !== driverId) throw new ForbiddenException('Not your ride');

    const bookings = await this.db.query<{ status: string }>(
      `SELECT status FROM bookings WHERE ride_id = $1`,
      [rideId],
    );
    const available = isCharterAvailable(
      bookings.map((b) => b.status),
      ride.charter_opt_out,
      ride.status,
    );
    const next = await this.nextPickup(rideId);
    return {
      rideId,
      available,
      optOut: ride.charter_opt_out,
      corridor: { origin: ride.origin_label, dest: ride.dest_label },
      nextPickupAt: next?.at ?? null,
      nextPickupLabel: next?.label ?? null,
    };
  }

  /** Driver opts in/out of charter offers for this ride. */
  async setCharterOptOut(rideId: string, driverId: string, optOut: boolean) {
    const row = await this.db.one(
      `UPDATE rides SET charter_opt_out = $3
       WHERE id = $1 AND driver_id = $2
       RETURNING id, charter_opt_out`,
      [rideId, driverId, optOut],
    );
    if (!row) throw new ForbiddenException('Ride not found or not yours');
    return row;
  }

  /**
   * Feasibility check: from where the driver is now, could they finish a charter
   * and still reach the next committed pickup on time? The travel estimate comes
   * from the routing provider, per spec.
   */
  async checkCharter(
    rideId: string,
    driverId: string,
    from: { lat: number; lng: number },
    charterDurationS = 0,
  ) {
    const ride = await this.db.one<{ driver_id: string }>(
      `SELECT driver_id FROM rides WHERE id = $1`,
      [rideId],
    );
    if (!ride) throw new NotFoundException('Ride not found');
    if (ride.driver_id !== driverId) throw new ForbiddenException('Not your ride');

    const next = await this.nextPickup(rideId);
    if (!next) {
      return canAcceptCharter({ now: new Date(), nextPickupAt: null, etaToPickupS: 0 });
    }
    const leg = await this.directions.route(from, { lat: next.lat, lng: next.lng });
    return canAcceptCharter({
      now: new Date(),
      nextPickupAt: new Date(next.at),
      etaToPickupS: charterDurationS + leg.durationS,
    });
  }

  /** The earliest committed pickup on this ride, with its scheduled ETA. */
  private async nextPickup(rideId: string) {
    const row = await this.db.one<{
      fp: string;
      pickup_label: string | null;
      lat: number;
      lng: number;
      departure_time: string;
      duration_s: number;
    }>(
      `SELECT b.fp, b.pickup_label,
              ST_Y(b.pickup) AS lat, ST_X(b.pickup) AS lng,
              r.departure_time, r.duration_s
       FROM bookings b JOIN rides r ON r.id = b.ride_id
       WHERE b.ride_id = $1 AND b.status IN ('matched','confirmed','ongoing')
       ORDER BY b.fp ASC LIMIT 1`,
      [rideId],
    );
    if (!row) return null;
    const at = new Date(
      new Date(row.departure_time).getTime() + Number(row.fp) * row.duration_s * 1000,
    ).toISOString();
    return { at, label: row.pickup_label, lat: row.lat, lng: row.lng };
  }

  /**
   * Driver presses "start trip"; passengers and dispatch see it live. The
   * gateway permits GPS updates while the ride remains ongoing.
   */
  async start(rideId: string, driverId: string) {
    const result = await this.db.tx(async (client) => {
      const ride = (
        await client.query<{
          id: string;
          driver_id: string;
          status: string;
          departure_time: string | Date;
        }>(
          `SELECT id, driver_id, status, departure_time
           FROM rides
           WHERE id = $1
           FOR UPDATE`,
          [rideId],
        )
      ).rows[0];

      if (!ride) throw new NotFoundException('Ride not found');
      if (ride.driver_id !== driverId) {
        throw new ForbiddenException('Not your ride');
      }
      if (!['open', 'full'].includes(ride.status)) {
        throw new ConflictException(
          `Ride cannot start (status: ${ride.status})`,
        );
      }

      const earliestStart =
        new Date(ride.departure_time).getTime() -
        RIDE_START_EARLY_MIN * 60 * 1000;
      if (Date.now() < earliestStart) {
        throw new ConflictException('Too early to start this ride');
      }

      const bookings = (
        await client.query<{ id: string; passenger_id: string }>(
          `UPDATE bookings SET status = 'ongoing'
           WHERE ride_id = $1
             AND status IN ('matched','confirmed')
           RETURNING id, passenger_id`,
          [rideId],
        )
      ).rows.map((booking) => ({
        id: booking.id,
        passengerId: booking.passenger_id,
      }));

      await client.query(
        `UPDATE rides SET status = 'ongoing' WHERE id = $1`,
        [rideId],
      );

      return {
        rideId,
        driverId,
        status: 'ongoing' as const,
        bookings,
      };
    });

    this.realtime.emitToRide(rideId, 'ride.started', result);
    this.realtime.emitToDispatch('ride.started', result);
    this.events.emit('ride.started', result);
    return result;
  }

  /**
   * Driver marks the ride finished. Stamps `completed_at` (the actual completion
   * time), which lets the scheduling rule use the shorter actual-gap formula
   * instead of the conservative estimated one. Any still-active bookings are
   * marked completed too, so no passenger is left dangling.
   */
  async complete(rideId: string, driverId: string) {
    const result = await this.db.tx(async (client) => {
      const ride = (
        await client.query(
          `SELECT id, driver_id, status, departure_time FROM rides WHERE id = $1 FOR UPDATE`,
          [rideId],
        )
      ).rows[0];
      if (!ride) throw new NotFoundException('Ride not found');
      if (ride.driver_id !== driverId) throw new ForbiddenException('Not your ride');
      if (ride.status === 'completed') throw new ConflictException('Ride already completed');
      if (ride.status === 'cancelled' || ride.status === 'expired') {
        throw new ConflictException(`Ride is ${ride.status}`);
      }
      if (new Date(ride.departure_time) > new Date()) {
        throw new ConflictException('Ride has not departed yet');
      }

      const finished = (
        await client.query(
          `UPDATE bookings SET status = 'completed'
           WHERE ride_id = $1 AND status IN ('matched','confirmed','ongoing')
           RETURNING id, passenger_id`,
          [rideId],
        )
      ).rows;

      const updated = (
        await client.query(
          `UPDATE rides SET status = 'completed', completed_at = now()
           WHERE id = $1 RETURNING id, status, completed_at`,
          [rideId],
        )
      ).rows[0];

      return {
        rideId,
        driverId,
        status: updated.status as string,
        completedAt: updated.completed_at as string,
        bookings: finished.map((b: { id: string; passenger_id: string }) => ({
          id: b.id,
          passengerId: b.passenger_id,
        })),
      };
    });

    this.realtime.emitToRide(rideId, 'ride.completed', result);
    this.realtime.emitToDispatch('ride.completed', result);
    this.events.emit('ride.completed', result);
    return result;
  }

  async cancel(rideId: string, driverId: string) {    const result = await this.db.tx(async (client) => {
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
           WHERE ride_id = $1 AND status IN ('matched','confirmed','ongoing')
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
