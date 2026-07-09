/**
 * Charter mode.
 *
 * Spec: when a ride is posted but no seat booking is confirmed yet, the vehicle
 * is ALSO offered for charter along the same route. While roaming on a charter,
 * the driver must still be able to reach the next scheduled pickup on time —
 * the minimum required travel time comes from the routing provider's estimate.
 *
 * Pure and deterministic so the rule is unit-testable without a DB or network.
 */

/** Seat bookings that hold a seat. Pending requests are not yet committed. */
const HOLDS_SEAT = ['matched', 'confirmed', 'ongoing'];

/**
 * Charter is available by default while nothing is booked, unless the driver
 * opted out. A single held seat turns it off — the vehicle is now committed.
 */
export function isCharterAvailable(
  bookingStatuses: string[],
  optOut = false,
  rideStatus = 'open',
): boolean {
  if (optOut) return false;
  if (rideStatus !== 'open') return false;
  return !bookingStatuses.some((s) => HOLDS_SEAT.includes(s));
}

export interface CharterFeasibilityInput {
  /** Now. */
  now: Date;
  /** When the driver must be at the next committed pickup (null = none). */
  nextPickupAt: Date | null;
  /** Routing estimate: seconds to finish the charter and reach that pickup. */
  etaToPickupS: number;
  /** Safety margin so the driver is not cutting it fine. */
  bufferS?: number;
}

export interface CharterFeasibility {
  feasible: boolean;
  /** The latest instant the driver could still set off and make it. */
  mustLeaveBy: Date | null;
  /** Seconds of slack; negative means late. */
  slackS: number | null;
  reason?: string;
}

/**
 * Can the driver take this charter and still make the next pickup?
 *   arrival = now + etaToPickup   must be <= nextPickupAt - buffer
 */
export function canAcceptCharter(input: CharterFeasibilityInput): CharterFeasibility {
  const buffer = input.bufferS ?? 900; // 15 min default
  if (!input.nextPickupAt) {
    // Nothing committed — the driver is free.
    return { feasible: true, mustLeaveBy: null, slackS: null, reason: 'no committed pickup' };
  }
  const deadlineMs = input.nextPickupAt.getTime() - buffer * 1000;
  const arrivalMs = input.now.getTime() + input.etaToPickupS * 1000;
  const slackS = Math.round((deadlineMs - arrivalMs) / 1000);
  return {
    feasible: slackS >= 0,
    mustLeaveBy: new Date(deadlineMs - input.etaToPickupS * 1000),
    slackS,
    reason: slackS >= 0 ? undefined : 'would arrive after the pickup deadline',
  };
}
