import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { MatchPreviewDto, MatchRequestDto } from './matching.dto';
import {
  CandidateDetour,
  CandidateFare,
  MatchCandidateRow,
  MatchProfile,
  RankedCandidate,
} from './matching.types';
import { scoreCandidate, toRanked } from './ranking';
import { freeSeatsOnSegment, Seg } from './segment-capacity';
import { compareByDetour, rankingReason } from './detour';
import { DetourService } from './detour.service';
import { fareForDistanceM } from '../pricing/pricing';

interface ProfileConfig {
  toleranceM: number; // baseline off-route distance for the corridor prefilter
  windowPadMin: number; // extra minutes added either side of the requested window
  limit: number;
  /** Drop candidates the detour rule rejects (strict) or keep them annotated
   *  with the rejection reason so a human can decide (relaxed). */
  dropIneligible: boolean;
}

const PROFILES: Record<MatchProfile, ProfileConfig> = {
  // Automatic matching: only detour-eligible rides may be booked.
  strict: { toleranceM: 2000, windowPadMin: 0, limit: 30, dropIneligible: true },
  // Dispatcher matching: wider, surface everything, let a human decide.
  relaxed: { toleranceM: 5000, windowPadMin: 120, limit: 50, dropIneligible: false },
};

/**
 * Two-stage matching:
 *  1. PostGIS corridor prefilter — cheap spatial reduction of candidate rides.
 *     The ST_DWithin tolerance widens with each ride's length so pickups
 *     outside the strict corridor still qualify when the ride is long enough
 *     to absorb the detour (an off-route point costs at least an out-and-back,
 *     so anything beyond distance x maxDetourRatio/2 can never pass the rule).
 *  2. Detour evaluation — the top candidates are routed via the directions
 *     provider (DetourService) and filtered/ranked by real road-distance
 *     detour. Approximate spatial distances are never the final detour.
 *
 * Ranking (spec): lowest detour, then lowest detour %, then more free seats,
 * then earlier ride creation.
 */
@Injectable()
export class MatchingService {
  constructor(
    private readonly db: DatabaseService,
    private readonly detour: DetourService,
  ) {}

  async search(req: MatchRequestDto, profile: MatchProfile = 'strict'): Promise<RankedCandidate[]> {
    const cfg = PROFILES[profile];
    const seats = req.seats ?? 1;
    const winStart = new Date(new Date(req.windowStart).getTime() - cfg.windowPadMin * 60000);
    const winEnd = new Date(new Date(req.windowEnd).getTime() + cfg.windowPadMin * 60000);

    const sql = `
      WITH req AS (
        SELECT ST_SetSRID(ST_MakePoint($1,$2),4326) AS pickup,
               ST_SetSRID(ST_MakePoint($3,$4),4326) AS dropoff
      )
      SELECT r.id, r.driver_id, r.vehicle_id, r.origin_label, r.dest_label,
             r.departure_time, r.created_at, r.available_seats, r.total_seats,
             r.price_per_seat, r.duration_s, r.distance_m,
             u.full_name AS driver_name, u.rating AS driver_rating,
             ST_LineLocatePoint(r.route, req.pickup)  AS fp,
             ST_LineLocatePoint(r.route, req.dropoff) AS fd,
             ST_Distance(r.route::geography, req.pickup::geography)  AS pickup_off_m,
             ST_Distance(r.route::geography, req.dropoff::geography) AS dropoff_off_m,
             ST_Length(ST_LineSubstring(r.route,
               LEAST(ST_LineLocatePoint(r.route, req.pickup), ST_LineLocatePoint(r.route, req.dropoff)),
               GREATEST(ST_LineLocatePoint(r.route, req.pickup), ST_LineLocatePoint(r.route, req.dropoff))
             )::geography) AS shared_m
      FROM rides r
      JOIN users u ON u.id = r.driver_id
      CROSS JOIN req
      WHERE r.status = 'open'
        AND r.departure_time > now()
        AND r.total_seats >= $5
        AND r.departure_time BETWEEN $6 AND $7
        AND ST_DWithin(r.route::geography, req.pickup::geography,
              GREATEST($8, COALESCE(r.distance_m, 0) * $10))
        AND ST_DWithin(r.route::geography, req.dropoff::geography,
              GREATEST($8, COALESCE(r.distance_m, 0) * $10))
        AND ST_LineLocatePoint(r.route, req.pickup) < ST_LineLocatePoint(r.route, req.dropoff)
      ORDER BY (ST_Distance(r.route::geography, req.pickup::geography)
              + ST_Distance(r.route::geography, req.dropoff::geography)) ASC
      LIMIT $9
    `;

    const rows = await this.db.query<MatchCandidateRow>(sql, [
      req.pickup.lng,
      req.pickup.lat,
      req.dropoff.lng,
      req.dropoff.lat,
      seats,
      winStart.toISOString(),
      winEnd.toISOString(),
      cfg.toleranceM,
      cfg.limit,
      this.detour.maxDetourRatio / 2,
    ]);

    // Per-segment availability: count only bookings that overlap each candidate's
    // searched [fp, fd) segment, not the whole ride. A ride that is "full" on a
    // busy stretch can still have room on a quieter one.
    const rideIds = rows.map((r) => r.id);
    const bookingsByRide = new Map<string, Seg[]>();
    if (rideIds.length > 0) {
      const bk = await this.db.query<{ ride_id: string; fp: string; fd: string; seats: number }>(
        `SELECT ride_id, fp, fd, seats FROM bookings
         WHERE ride_id = ANY($1) AND status IN ('matched','confirmed','ongoing')`,
        [rideIds],
      );
      for (const b of bk) {
        const arr = bookingsByRide.get(b.ride_id) ?? [];
        arr.push({ fp: Number(b.fp), fd: Number(b.fd), seats: b.seats });
        bookingsByRide.set(b.ride_id, arr);
      }
    }

    const withSeats = rows.filter((r) => {
      const segs = bookingsByRide.get(r.id) ?? [];
      const free = freeSeatsOnSegment(segs, r.total_seats, r.fp, r.fd);
      r.available_seats = free; // surface seats free on THIS segment
      return free >= seats;
    });

    // Passenger fare is ride-independent: their own road distance x bracket rate.
    const paxRoute = await this.detour.passengerRoute(req.pickup, req.dropoff);
    let fareQuote: CandidateFare | null = null;
    if (paxRoute) {
      const f = fareForDistanceM(paxRoute.distanceM);
      fareQuote = {
        routeDistanceM: f.distanceM,
        farePerSeat: f.farePerSeat,
        ratePerKm: f.ratePerKm,
        seats,
        totalFare: f.farePerSeat * seats,
      };
    }

    // Detour evaluation, bounded by the routing budget. Rows arrive ordered by
    // spatial proximity, so the budget goes to the most promising rides.
    const evaluated: RankedCandidate[] = [];
    for (const row of withSeats.slice(0, this.detour.maxRoutedCandidates)) {
      const candidate = toRanked(row, scoreCandidate(row, {
        desiredPickup: req.desiredPickup ? new Date(req.desiredPickup) : undefined,
      }));
      candidate.fareQuote = fareQuote;

      const ctx = await this.detour.stopContext(row.id);
      const result = ctx ? await this.detour.evaluate(ctx, req.pickup, req.dropoff) : null;
      if (!result || !result.ok) {
        candidate.exclusionReason = result
          ? `Could not evaluate detour (${result.reason})`
          : 'Ride disappeared during evaluation';
        if (!cfg.dropIneligible) evaluated.push(candidate);
        continue;
      }
      candidate.detour = {
        originalRemainingM: result.metrics.originalRemainingM,
        matchedRouteM: result.metrics.matchedRouteM,
        detourM: result.metrics.detourM,
        detourPct: result.metrics.detourPct,
        pickupInsertIdx: result.metrics.pickupInsertIdx,
        dropoffInsertIdx: result.metrics.dropoffInsertIdx,
        extraDurationS: result.metrics.extraDurationS,
      };
      candidate.eligible = result.eligible;
      if (!result.eligible) {
        candidate.exclusionReason =
          `Detour ${(result.metrics.detourM / 1000).toFixed(1)} km exceeds ` +
          `${Math.round(result.maxDetourRatio * 100)}% of the remaining route ` +
          `(${(result.metrics.originalRemainingM / 1000).toFixed(1)} km)`;
        if (cfg.dropIneligible) continue;
      }
      evaluated.push(candidate);
    }

    const rankKey = (c: RankedCandidate) => ({
      detourM: c.detour?.detourM ?? Number.MAX_SAFE_INTEGER,
      detourPct: c.detour?.detourPct ?? Number.MAX_SAFE_INTEGER,
      availableSeats: c.availableSeats,
      createdAt: c.createdAt,
    });
    const ranked = evaluated.sort((a, b) => {
      // Eligible candidates always rank above ineligible ones (relaxed profile).
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return compareByDetour(rankKey(a), rankKey(b));
    });
    ranked.forEach((c, i) => {
      if (c.eligible && c.detour) c.rankingReason = rankingReason(rankKey(c), i);
    });
    return ranked;
  }

  /**
   * Preview a specific ride for a pickup/dropoff pair: the same eligibility
   * checks a booking will run, plus the fare quote — so clients can show why
   * a match will succeed or fail before committing.
   */
  async preview(req: MatchPreviewDto) {
    const seats = req.seats ?? 1;
    const ride = await this.db.one<{
      id: string;
      status: string;
      departure_time: string;
      total_seats: number;
      fp: number;
      fd: number;
    }>(
      `SELECT id, status, departure_time, total_seats,
              ST_LineLocatePoint(route, ST_SetSRID(ST_MakePoint($2,$3),4326)) AS fp,
              ST_LineLocatePoint(route, ST_SetSRID(ST_MakePoint($4,$5),4326)) AS fd
       FROM rides WHERE id = $1`,
      [req.rideId, req.pickup.lng, req.pickup.lat, req.dropoff.lng, req.dropoff.lat],
    );
    if (!ride) throw new NotFoundException('Ride not found');

    const reasons: string[] = [];
    if (ride.status !== 'open') reasons.push(`Ride is ${ride.status}`);
    if (new Date(ride.departure_time) <= new Date()) reasons.push('Ride has already departed');
    if (!(ride.fp < ride.fd)) reasons.push('Pickup must be before dropoff along the route');

    const segs = (
      await this.db.query<{ fp: string; fd: string; seats: number }>(
        `SELECT fp, fd, seats FROM bookings
         WHERE ride_id = $1 AND status IN ('matched','confirmed','ongoing')`,
        [req.rideId],
      )
    ).map((b) => ({ fp: Number(b.fp), fd: Number(b.fd), seats: b.seats }));
    const seatsFree = freeSeatsOnSegment(segs, ride.total_seats, ride.fp, ride.fd);
    if (seatsFree < seats) reasons.push(`Only ${seatsFree} seat(s) free on this segment`);

    const paxRoute = await this.detour.passengerRoute(req.pickup, req.dropoff);
    let fareQuote: CandidateFare | null = null;
    if (paxRoute) {
      const f = fareForDistanceM(paxRoute.distanceM);
      fareQuote = {
        routeDistanceM: f.distanceM,
        farePerSeat: f.farePerSeat,
        ratePerKm: f.ratePerKm,
        seats,
        totalFare: f.farePerSeat * seats,
      };
    } else {
      reasons.push('Could not route your pickup to your dropoff');
    }

    const evalRes = await this.detour.evaluateForRide(req.rideId, req.pickup, req.dropoff);
    let detour: CandidateDetour | null = null;
    if (!evalRes || !evalRes.result.ok) {
      reasons.push(
        `Could not evaluate detour (${evalRes && !evalRes.result.ok ? evalRes.result.reason : 'ride missing'})`,
      );
    } else {
      const m = evalRes.result.metrics;
      detour = {
        originalRemainingM: m.originalRemainingM,
        matchedRouteM: m.matchedRouteM,
        detourM: m.detourM,
        detourPct: m.detourPct,
        pickupInsertIdx: m.pickupInsertIdx,
        dropoffInsertIdx: m.dropoffInsertIdx,
        extraDurationS: m.extraDurationS,
      };
      if (!evalRes.result.eligible) {
        reasons.push(
          `Detour ${(m.detourM / 1000).toFixed(1)} km exceeds ` +
            `${Math.round(evalRes.result.maxDetourRatio * 100)}% of the remaining route`,
        );
      }
    }

    return {
      rideId: req.rideId,
      eligible: reasons.length === 0,
      reasons,
      seatsRequested: seats,
      seatsFree,
      maxDetourRatio: this.detour.maxDetourRatio,
      detour,
      fareQuote,
    };
  }
}
