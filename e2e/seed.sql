-- Promote a phone number to dispatcher so it can use the dispatch console.
-- Run against the running DB, e.g.:
--   docker compose exec -T db psql -U ecogo -d ecogo -f - < e2e/seed.sql
INSERT INTO users (phone, full_name, roles)
VALUES ('0900000009', 'Điều phối viên', '{passenger,dispatcher}')
ON CONFLICT (phone) DO UPDATE SET roles = '{passenger,dispatcher}';
