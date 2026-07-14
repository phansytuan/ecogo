import { LatLng } from '../rides/directions/directions.provider';
import { haversineKm } from '../rides/geo';

/**
 * Pure detour-matching logic: insertion-position enumeration, eligibility
 * against the configurable max-detour ratio, metric derivation, and candidate
 * ranking. No DB or HTTP here — DetourService feeds it road distances from
 * the routing provider. Straight-line math appears ONLY inside the cheap
 * pre-ranking heuristic that decides which insertion plans are worth a
 * routing-provider call; every final distance is a provider road distance.
 */

/** A stop on the driver's route, in visit order. */
export interface RouteStop extends LatLng {
  kind: 'origin' | 'pickup' | 'dropoff' | 'dest';
  /** Already visited — insertion before/between completed stops is forbidden. */
  completed?: boolean;
}

/** Insert the new pickup before remaining-gap `pickupIdx`, dropoff before `dropoffIdx`. */
export interface InsertionPlan {
  /** 0..n — index into the gaps of the REMAINING intermediate-stop sequence. */
  pickupIdx: number;
  /** pickupIdx..n — the dropoff is always at or after the pickup gap. */
  dropoffIdx: number;
}

export interface DetourMetrics {
  /** Road distance of the driver's remaining route before the passenger (m). */
  originalRemainingM: number;
  /** Road distance of the best route including the passenger's stops (m). */
  matchedRouteM: number;
  /** matched - original, clamped at 0 (m). */
  detourM: number;
  /** detourM / originalRemainingM. */
  detourPct: number;
  /** Chosen insertion gaps (relative to the remaining intermediate stops). */
  pickupInsertIdx: number;
  dropoffInsertIdx: number;
  /** Estimated additional drive time, when the provider reports durations. */
  extraDurationS: number | null;
  /** True when matched < original by more than rounding noise — logged upstream. */
  materialNegative: boolean;
}

/** Rounding slack (m): matched < original by less than this is clamped silently. */
export const DETOUR_ROUNDING_SLACK_M = 250;

/**
 * All valid insertion plans for `intermediateCount` remaining intermediate
 * stops: pickup into any of the n+1 gaps, dropoff into the same or a later
 * gap — so pickup always precedes dropoff, and existing stops keep their
 * order. Completed stops must be excluded from the sequence by the caller
 * (plans index only the remaining gaps), which makes reordering them
 * impossible by construction.
 */
export function insertionPlans(intermediateCount: number): InsertionPlan[] {
  const plans: InsertionPlan[] = [];
  for (let p = 0; p <= intermediateCount; p++) {
    for (let d = p; d <= intermediateCount; d++) {
      plans.push({ pickupIdx: p, dropoffIdx: d });
    }
  }
  return plans;
}

/**
 * The waypoint sequence for a plan: intermediate stops with the passenger's
 * pickup/dropoff spliced into the chosen gaps (pickup first when both land in
 * the same gap). Origin/destination are NOT included — this is the waypoint
 * list handed to DirectionsProvider.route(origin, dest, waypoints).
 */
export function applyPlan(
  intermediates: LatLng[],
  pickup: LatLng,
  dropoff: LatLng,
  plan: InsertionPlan,
): LatLng[] {
  const out: LatLng[] = [];
  for (let i = 0; i <= intermediates.length; i++) {
    if (plan.pickupIdx === i) out.push(pickup);
    if (plan.dropoffIdx === i) out.push(dropoff);
    if (i < intermediates.length) out.push(intermediates[i]);
  }
  return out;
}

/**
 * Cheap straight-line estimate (km) of how much a plan lengthens the route.
 * Used only to decide which plans get a real routing call, never as a final
 * distance: plans are routed in ascending-estimate order up to the budget.
 */
export function estimatePlanDeltaKm(
  points: LatLng[], // full remaining sequence: origin, ...intermediates, dest
  pickup: LatLng,
  dropoff: LatLng,
  plan: InsertionPlan,
): number {
  // Splice into the full point sequence (gap g sits between points[g] and points[g+1]).
  const seq: LatLng[] = [points[0]];
  for (let g = 0; g < points.length - 1; g++) {
    if (plan.pickupIdx === g) seq.push(pickup);
    if (plan.dropoffIdx === g) seq.push(dropoff);
    seq.push(points[g + 1]);
  }
  let before = 0;
  for (let i = 1; i < points.length; i++) {
    before += haversineKm([points[i - 1].lng, points[i - 1].lat], [points[i].lng, points[i].lat]);
  }
  let after = 0;
  for (let i = 1; i < seq.length; i++) {
    after += haversineKm([seq[i - 1].lng, seq[i - 1].lat], [seq[i].lng, seq[i].lat]);
  }
  return after - before;
}

/**
 * Eligibility rule: matched <= original * (1 + maxDetourRatio), with 1 m of
 * slack so a route exactly at the limit (e.g. 360 km vs 300 km at 20%) is
 * valid even after floating-point rounding.
 */
export function isWithinDetourLimit(
  matchedRouteM: number,
  originalRemainingM: number,
  maxDetourRatio: number,
): boolean {
  if (!(originalRemainingM > 0) || !(matchedRouteM > 0)) return false;
  return matchedRouteM <= originalRemainingM * (1 + maxDetourRatio) + 1;
}

/** Derive the persisted metric set from the two road distances. */
export function detourMetrics(
  originalRemainingM: number,
  matchedRouteM: number,
  plan: InsertionPlan,
  extraDurationS: number | null = null,
): DetourMetrics {
  const original = Math.round(originalRemainingM);
  const matched = Math.round(matchedRouteM);
  const raw = matched - original;
  return {
    originalRemainingM: original,
    matchedRouteM: matched,
    detourM: Math.max(0, raw),
    detourPct: original > 0 ? Math.max(0, raw) / original : 0,
    pickupInsertIdx: plan.pickupIdx,
    dropoffInsertIdx: plan.dropoffIdx,
    extraDurationS: extraDurationS == null ? null : Math.max(0, Math.round(extraDurationS)),
    materialNegative: raw < -DETOUR_ROUNDING_SLACK_M,
  };
}

export interface RankableCandidate {
  detourM: number;
  detourPct: number;
  availableSeats: number;
  createdAt: string | Date;
}

/**
 * Ranking rule (spec order): lowest detour distance, then lowest detour
 * percentage, then more available seats, then earlier ride creation.
 */
export function compareByDetour(a: RankableCandidate, b: RankableCandidate): number {
  if (a.detourM !== b.detourM) return a.detourM - b.detourM;
  if (a.detourPct !== b.detourPct) return a.detourPct - b.detourPct;
  if (a.availableSeats !== b.availableSeats) return b.availableSeats - a.availableSeats;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

/** Human-readable explanation of why a candidate ranked where it did. */
export function rankingReason(c: RankableCandidate, rank: number): string {
  const km = (c.detourM / 1000).toFixed(1);
  const pct = (c.detourPct * 100).toFixed(1);
  const base = `Detour ${km} km (+${pct}% of remaining route), ${c.availableSeats} seat(s) free`;
  return rank === 0 ? `${base} — smallest detour among eligible rides` : base;
}
