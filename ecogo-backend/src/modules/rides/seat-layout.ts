/**
 * Physical seat layouts per vehicle type.
 *
 * Seats become addressable positions (e.g. "R2-1") arranged in rows that mirror
 * the real vehicle, so the driver app can show a seat map and drivers/passengers
 * can lock or pick a specific seat. The number of sellable seats still matches
 * the vehicle's seat count (the driver's own seat is not sellable).
 *
 * Pure and deterministic — unit-testable without a DB.
 */
export interface SeatCell {
  /** Stable seat id, unique within the vehicle, e.g. 'R2-1'. */
  id: string;
  row: number;
  /** 1-based column within the row. */
  col: number;
  /** A driver seat is shown for context but never sellable/bookable. */
  kind: 'driver' | 'passenger';
}

export interface SeatLayout {
  type: string;
  rows: SeatCell[][];
  /** All sellable (passenger) seat ids, in a stable order. */
  passengerSeatIds: string[];
}

function cell(row: number, col: number, kind: 'driver' | 'passenger'): SeatCell {
  return { id: `R${row}-${col}`, row, col, kind };
}

/**
 * Layout definitions. Each row is a left-to-right list of cells. The driver
 * seat sits front-left for context. Passenger-seat totals: car_4=3, car_7=6,
 * limousine=6 (2+2+2 captain style), van_16=15.
 */
export function seatLayout(vehicleType: string): SeatLayout {
  let rows: SeatCell[][];
  switch (vehicleType) {
    case 'car_4':
      rows = [
        [cell(1, 1, 'driver'), cell(1, 2, 'passenger')],
        [cell(2, 1, 'passenger'), cell(2, 2, 'passenger')],
      ];
      break;
    case 'car_7':
      rows = [
        [cell(1, 1, 'driver'), cell(1, 2, 'passenger')],
        [cell(2, 1, 'passenger'), cell(2, 2, 'passenger'), cell(2, 3, 'passenger')],
        [cell(3, 1, 'passenger'), cell(3, 2, 'passenger')],
      ];
      break;
    case 'limousine':
      // Captain-chair limousine: 3 rows of 2 behind the driver.
      rows = [
        [cell(1, 1, 'driver')],
        [cell(2, 1, 'passenger'), cell(2, 2, 'passenger')],
        [cell(3, 1, 'passenger'), cell(3, 2, 'passenger')],
        [cell(4, 1, 'passenger'), cell(4, 2, 'passenger')],
      ];
      break;
    case 'van_16':
      // Driver + 15 passengers, 5 rows of 3.
      rows = [
        [cell(1, 1, 'driver')],
        [cell(2, 1, 'passenger'), cell(2, 2, 'passenger'), cell(2, 3, 'passenger')],
        [cell(3, 1, 'passenger'), cell(3, 2, 'passenger'), cell(3, 3, 'passenger')],
        [cell(4, 1, 'passenger'), cell(4, 2, 'passenger'), cell(4, 3, 'passenger')],
        [cell(5, 1, 'passenger'), cell(5, 2, 'passenger'), cell(5, 3, 'passenger')],
        [cell(6, 1, 'passenger'), cell(6, 2, 'passenger'), cell(6, 3, 'passenger')],
      ];
      break;
    default:
      // Fallback: a single row of passenger seats.
      rows = [[cell(1, 1, 'driver'), cell(1, 2, 'passenger')]];
  }
  const passengerSeatIds = rows
    .flat()
    .filter((c) => c.kind === 'passenger')
    .map((c) => c.id);
  return { type: vehicleType, rows, passengerSeatIds };
}

/** Number of sellable seats for a vehicle type. */
export function passengerSeatCount(vehicleType: string): number {
  return seatLayout(vehicleType).passengerSeatIds.length;
}

/** Is `seatId` a valid, sellable seat for this vehicle type? */
export function isSellableSeat(vehicleType: string, seatId: string): boolean {
  return seatLayout(vehicleType).passengerSeatIds.includes(seatId);
}
