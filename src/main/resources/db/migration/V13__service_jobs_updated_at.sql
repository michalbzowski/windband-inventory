-- B15 (2026-10-19): the initial service_jobs DDL (V12) lacked the audit column;
-- the entity maps it as NOT NULL. Add it idempotently as a follow-up migration
-- because V12 is already applied to running databases.
ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT now();
