/**
 * Passenger manifest rules.
 *
 * The account holder is passenger #1 and is already known. When a booking is for
 * two or more seats, the additional travellers must be identified: full name is
 * required, phone is required so the driver can reach them, email is optional.
 *
 * Pure, so the rules are unit-testable without a DB.
 */
export interface Companion {
  fullName: string;
  phone?: string | null;
  email?: string | null;
}

export type ManifestCheck = { ok: true } | { ok: false; message: string };

const VN_PHONE = /^(0|\+84)\d{9,10}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** How many companions a booking of `seats` seats must declare. */
export function requiredCompanions(seats: number): number {
  return Math.max(0, seats - 1);
}

export function validateManifest(seats: number, companions: Companion[]): ManifestCheck {
  const required = requiredCompanions(seats);

  if (companions.length !== required) {
    return {
      ok: false,
      message:
        required === 0
          ? 'A single-seat booking takes no additional passengers'
          : `A ${seats}-seat booking needs details for ${required} additional passenger(s)`,
    };
  }

  for (const [i, c] of companions.entries()) {
    const at = `Passenger ${i + 2}`;
    if (!c.fullName || c.fullName.trim().length < 2) {
      return { ok: false, message: `${at}: full name is required` };
    }
    if (!c.phone || !VN_PHONE.test(c.phone.trim())) {
      return { ok: false, message: `${at}: a valid phone number is required` };
    }
    if (c.email != null && c.email.trim() !== '' && !EMAIL.test(c.email.trim())) {
      return { ok: false, message: `${at}: email is not valid` };
    }
  }
  return { ok: true };
}
