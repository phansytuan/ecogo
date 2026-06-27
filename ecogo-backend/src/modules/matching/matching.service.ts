import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { MatchRequestDto } from './matching.dto';
import { MatchCandidateRow, MatchProfile, RankedCandidate } from './matching.types';
import { rankCandidates } from './ranking';

interface ProfileConfig {
  toleranceM: number; // how far off the route a pickup/dropoff may sit
  windowPadMin: number; // extra minutes added either side of the requested window
  limit: number;
  /** Drop candidates whose total off-route distance exceeds this (meters). null = keep all. */
  offsetCeilingM: number | null;
}

const PROFILES: Record<MatchProfile, ProfileConfig> = {
  // Automatic matching: tight, with a hard off-route ceiling.
  strict: { toleranceM: 2000, windowPadMin: 0, limit: 30, offsetCeilingM: 3000 },
  // Dispatcher matching: wider, no ceiling — surface everything, let a human decide.
  relaxed: { toleranceM: 5000, windowPadMin: 120, limit: 50, offsetCeilingM: null },
};

/**
 * Corridor matching. The four geospatial WHERE clauses are the whole engine:
 *  - pickup near the route (ST_DWithin)
 *  - dropoff near the route (ST_DWithin)
 *  - pickup BEFORE dropoff along the route (ST_LineLocatePoint fp < fd) = same direction
 * Ranking happens in TypeScript (see ranking.ts) so it can be tuned and tested.
 */
@Injectable()
export class MatchingService {
  constructor(private readonly db: DatabaseService) {}

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
             r.departure_time, r.available_seats, r.price_per_seat, r.duration_s,
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
        AND r.available_seats >= $5
        AND r.departure_time BETWEEN $6 AND $7
        AND ST_DWithin(r.route::geography, req.pickup::geography,  $8)
        AND ST_DWithin(r.route::geography, req.dropoff::geography, $8)
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
    ]);

    const filtered =
      cfg.offsetCeilingM == null
        ? rows
        : rows.filter((r) => r.pickup_off_m + r.dropoff_off_m <= cfg.offsetCeilingM!);

    return rankCandidates(filtered, {
      desiredPickup: req.desiredPickup ? new Date(req.desiredPickup) : undefined,
    });
  }
}
