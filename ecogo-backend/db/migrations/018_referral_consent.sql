-- Existing referrals are grandfathered as confirmed; new claims await user consent.
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed';
ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_status_check;
ALTER TABLE referrals
  ADD CONSTRAINT referrals_status_check
  CHECK (status IN ('pending_confirmation','confirmed','rejected'));
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
