-- Suspended means an operator revoked a previously verified driver's approval.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_kyc_status_check;

ALTER TABLE users
  ADD CONSTRAINT users_kyc_status_check
  CHECK (
    kyc_status IN ('none','pending','verified','rejected','suspended')
  );
