import { requiredCompanions, validateManifest } from './manifest';

const good = { fullName: 'Nguyen Van A', phone: '0912345678', email: 'a@example.com' };

describe('requiredCompanions', () => {
  it('a single seat needs none; N seats need N-1', () => {
    expect(requiredCompanions(1)).toBe(0);
    expect(requiredCompanions(2)).toBe(1);
    expect(requiredCompanions(4)).toBe(3);
  });
  it('never negative', () => {
    expect(requiredCompanions(0)).toBe(0);
  });
});

describe('validateManifest', () => {
  it('accepts a 1-seat booking with no companions', () => {
    expect(validateManifest(1, []).ok).toBe(true);
  });

  it('rejects companions on a 1-seat booking', () => {
    expect(validateManifest(1, [good]).ok).toBe(false);
  });

  it('requires companion details once 2+ seats are booked', () => {
    const r = validateManifest(2, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/1 additional passenger/);
  });

  it('accepts a complete 3-seat manifest', () => {
    expect(validateManifest(3, [good, { ...good, email: null }]).ok).toBe(true);
  });

  it('full name is required', () => {
    const r = validateManifest(2, [{ ...good, fullName: ' ' }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/full name/);
  });

  it('phone is required and must be a VN number', () => {
    expect(validateManifest(2, [{ ...good, phone: null }]).ok).toBe(false);
    expect(validateManifest(2, [{ ...good, phone: '123' }]).ok).toBe(false);
    expect(validateManifest(2, [{ ...good, phone: '+84912345678' }]).ok).toBe(true);
  });

  it('email is optional but validated when present', () => {
    expect(validateManifest(2, [{ ...good, email: null }]).ok).toBe(true);
    expect(validateManifest(2, [{ ...good, email: '' }]).ok).toBe(true);
    const r = validateManifest(2, [{ ...good, email: 'not-an-email' }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/email/);
  });

  it('names the offending passenger by seat position', () => {
    const r = validateManifest(3, [good, { ...good, fullName: '' }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/Passenger 3/);
  });
});
