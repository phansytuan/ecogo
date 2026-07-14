import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';
import {
  DIRECTIONS_PROVIDER,
  DirectionsProvider,
  LatLng,
  RouteResult,
} from '../rides/directions/directions.provider';
import { polylineKm } from '../rides/geo';
import {
  detourMetrics,
  DetourMetrics,
  estimatePlanDeltaKm,
  insertionPlans,
  isWithinDetourLimit,
} from './detour';

/** Why a ride could not be evaluated (as opposed to evaluated-but-ineligible). */
export type DetourFailure = 'missing-coordinates' | 'invalid-route' | 'routing-failed';

export type DetourEvaluation =
  | { ok: true; metrics: DetourMetrics; eligible: boolean; maxDetourRatio: number }
  | { ok: false; reason: DetourFailure };

/** The driver's remaining route: endpoints + committed passenger stops in visit order. */
export interface RideStopContext {
  rideId: string;
  origin: LatLng;
  dest: LatLng;
  intermediates: LatLng[];
  /** Sorted ids of the bookings whose stops are in `intermediates` — used to
   *  detect that the stop set changed between evaluation and the booking tx. */
  activeBookingIds: string[];
}

/**
 * Detour evaluation against the routing provider. All distances are road
 * distances (polyline length of the provider's route); the only straight-line
 * math is the pre-ranking heuristic that chooses which insertion plans get a
 * routing call. Provider calls go through CachedDirectionsService, so repeated
 * evaluations of the same stop sequence are served from Redis.
 *
 * Performance safeguards: per search we route at most `maxRoutedCandidates`
 * rides x (1 original + `maxRoutedCombos` insertion plans) provider calls,
 * each bounded by `routingTimeoutMs`.
 */
@Injectable()
export class DetourService {
  private readonly logger = new Logger(DetourService.name);

  constructor(
    @Inject(DIRECTIONS_PROVIDER) private readonly directions: DirectionsProvider,
    private readonly config: ConfigService,
    private readonly db: DatabaseService,
  ) {}

  get maxDetourRatio(): number {
    return this.config.get<number>('matching.maxDetourRatio') ?? 0.2;
  }

  get maxRoutedCandidates(): number {
    return this.config.get<number>('matching.maxRoutedCandidates') ?? 8;
  }

  private get maxRoutedCombos(): number {
    return this.config.get<number>('matching.maxRoutedCombos') ?? 6;
  }

  private route(origin: LatLng, dest: LatLng, waypoints: LatLng[]): Promise<RouteResult> {
    const timeoutMs = this.config.get<number>('matching.routingTimeoutMs') ?? 8000;
    return new Promise<RouteResult>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`routing timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
      this.directions
        .route(origin, dest, waypoints)
        .then((r) => resolve(r))
        .catch((e) => reject(e))
        .finally(() => clearTimeout(timer));
    });
  }

  /** Road distance + duration for the passenger's own pickup -> dropoff trip. */
  async passengerRoute(
    pickup: LatLng,
    dropoff: LatLng,
  ): Promise<{ distanceM: number; durationS: number } | null> {
    if (!isFinitePoint(pickup) || !isFinitePoint(dropoff)) return null;
    try {
      const r = await this.route(pickup, dropoff, []);
      const distanceM = Math.round(polylineKm(r.coordinates) * 1000);
      if (!(distanceM > 0)) return null;
      return { distanceM, durationS: r.durationS };
    } catch (error) {
      this.logger.warn(`Passenger route failed: ${error}`);
      return null;
    }
  }

  /**
   * The remaining stop sequence of a ride: route endpoints plus every active
   * booking's pickup/dropoff ordered by its fraction along the corridor.
   * Matching never runs against departed rides here (search filters
   * status='open'), so the whole sequence is still pending — completed stops
   * can therefore never be reordered: they simply never enter the sequence.
   */
  async stopContext(rideId: string): Promise<RideStopContext | null> {
    const ride = await this.db.one<{ route: string }>(
      `SELECT ST_AsGeoJSON(route) AS route FROM rides WHERE id = $1`,
      [rideId],
    );
    if (!ride) return null;
    const coords: [number, number][] = JSON.parse(ride.route).coordinates;
    if (!coords || coords.length < 2) return null;

    const bookings = await this.db.query<{
      id: string;
      fp: string;
      fd: string;
      pickup_lat: number;
      pickup_lng: number;
      dropoff_lat: number;
      dropoff_lng: number;
    }>(
      `SELECT id, fp, fd,
              ST_Y(pickup) AS pickup_lat, ST_X(pickup) AS pickup_lng,
              ST_Y(dropoff) AS dropoff_lat, ST_X(dropoff) AS dropoff_lng
       FROM bookings
       WHERE ride_id = $1 AND status IN ('matched','confirmed','ongoing')`,
      [rideId],
    );

    const stops = bookings
      .flatMap((b) => [
        { fraction: Number(b.fp), lat: b.pickup_lat, lng: b.pickup_lng },
        { fraction: Number(b.fd), lat: b.dropoff_lat, lng: b.dropoff_lng },
      ])
      .sort((a, b) => a.fraction - b.fraction);

    return {
      rideId,
      origin: { lng: coords[0][0], lat: coords[0][1] },
      dest: { lng: coords[coords.length - 1][0], lat: coords[coords.length - 1][1] },
      intermediates: stops.map((s) => ({ lat: s.lat, lng: s.lng })),
      activeBookingIds: bookings.map((b) => b.id).sort(),
    };
  }

  /**
   * Evaluate inserting `pickup`/`dropoff` into the ride's remaining route.
   *
   * Distances are built LEG BY LEG: each consecutive stop pair is routed as
   * its own provider call (no multi-waypoint requests), and a matched route's
   * distance is the original minus the split legs plus the legs around the
   * inserted points. This is exact for road routing, works with providers
   * that lack multi-stop support, and is cheap: legs are memoized within the
   * evaluation AND cached per coordinate pair in Redis, so insertion plans —
   * which share most legs — only pay for the few legs they actually change.
   */
  async evaluate(
    ctx: RideStopContext,
    pickup: LatLng,
    dropoff: LatLng,
  ): Promise<DetourEvaluation> {
    if (
      !isFinitePoint(pickup) ||
      !isFinitePoint(dropoff) ||
      !isFinitePoint(ctx.origin) ||
      !isFinitePoint(ctx.dest) ||
      ctx.intermediates.some((p) => !isFinitePoint(p))
    ) {
      return { ok: false, reason: 'missing-coordinates' };
    }

    // Memoized single-leg road route (meters + seconds).
    const memo = new Map<string, Promise<{ m: number; s: number }>>();
    const leg = (a: LatLng, b: LatLng): Promise<{ m: number; s: number }> => {
      const k = `${a.lat.toFixed(6)},${a.lng.toFixed(6)}|${b.lat.toFixed(6)},${b.lng.toFixed(6)}`;
      let p = memo.get(k);
      if (!p) {
        p = this.route(a, b, []).then((r) => ({
          m: polylineKm(r.coordinates) * 1000,
          s: r.durationS,
        }));
        p.catch(() => {}); // handled at each await site; avoid unhandled rejections
        memo.set(k, p);
      }
      return p;
    };

    const points = [ctx.origin, ...ctx.intermediates, ctx.dest];
    let baseLegs: { m: number; s: number }[];
    try {
      baseLegs = await Promise.all(
        points.slice(1).map((pt, i) => leg(points[i], pt)),
      );
    } catch (error) {
      this.logger.warn(`Original-route routing failed for ride ${ctx.rideId}: ${error}`);
      return { ok: false, reason: 'routing-failed' };
    }
    const originalM = Math.round(baseLegs.reduce((a, l) => a + l.m, 0));
    const originalS = baseLegs.reduce((a, l) => a + l.s, 0);
    if (!(originalM > 0)) return { ok: false, reason: 'invalid-route' };

    const plans = insertionPlans(ctx.intermediates.length)
      .map((plan) => ({
        plan,
        estimate: estimatePlanDeltaKm(points, pickup, dropoff, plan),
      }))
      .sort((a, b) => a.estimate - b.estimate)
      .slice(0, this.maxRoutedCombos);

    let best: { matchedM: number; plan: (typeof plans)[number]['plan']; durationS: number } | null =
      null;
    for (const { plan } of plans) {
      try {
        // Gap g sits between points[g] and points[g+1].
        const p = plan.pickupIdx;
        const d = plan.dropoffIdx;
        let matchedM: number;
        let matchedS: number;
        if (p === d) {
          const [a, b, c] = await Promise.all([
            leg(points[p], pickup),
            leg(pickup, dropoff),
            leg(dropoff, points[p + 1]),
          ]);
          matchedM = originalM - baseLegs[p].m + a.m + b.m + c.m;
          matchedS = originalS - baseLegs[p].s + a.s + b.s + c.s;
        } else {
          const [a, b, c, e] = await Promise.all([
            leg(points[p], pickup),
            leg(pickup, points[p + 1]),
            leg(points[d], dropoff),
            leg(dropoff, points[d + 1]),
          ]);
          matchedM = originalM - baseLegs[p].m - baseLegs[d].m + a.m + b.m + c.m + e.m;
          matchedS = originalS - baseLegs[p].s - baseLegs[d].s + a.s + b.s + c.s + e.s;
        }
        matchedM = Math.round(matchedM);
        if (!(matchedM > 0)) continue;
        if (!best || matchedM < best.matchedM) {
          best = { matchedM, plan, durationS: matchedS };
        }
      } catch (error) {
        this.logger.warn(`Insertion routing failed for ride ${ctx.rideId}: ${error}`);
      }
    }
    if (!best) return { ok: false, reason: 'routing-failed' };

    const metrics = detourMetrics(
      originalM,
      best.matchedM,
      best.plan,
      best.durationS - originalS,
    );
    if (metrics.materialNegative) {
      this.logger.warn(
        `Matched route materially shorter than original for ride ${ctx.rideId}: ` +
          `${best.matchedM}m vs ${originalM}m — clamped detour to 0`,
      );
    }
    return {
      ok: true,
      metrics,
      eligible: isWithinDetourLimit(best.matchedM, originalM, this.maxDetourRatio),
      maxDetourRatio: this.maxDetourRatio,
    };
  }

  /** Convenience: stop context + evaluation in one call (preview, booking). */
  async evaluateForRide(
    rideId: string,
    pickup: LatLng,
    dropoff: LatLng,
  ): Promise<{ ctx: RideStopContext; result: DetourEvaluation } | null> {
    const ctx = await this.stopContext(rideId);
    if (!ctx) return null;
    return { ctx, result: await this.evaluate(ctx, pickup, dropoff) };
  }
}

function isFinitePoint(p: LatLng | undefined | null): boolean {
  return (
    p != null &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
}
