-- Korekta V15: last_value musi być BIGINT, bo entity SerialSequence.lastValue
-- jest `long` — Hibernate (ddl-auto: validate) odmawia startu przy int4
-- (product crash 2026-10-20, Railway windband-inventory-backend).
-- ALTER TYPE int4 -> int8 jest niezniszczające; wartości liczników (0..N)
-- mieszczą się i w jednym, i w drugim zakresie.
ALTER TABLE serial_sequences
    ALTER COLUMN last_value TYPE BIGINT;
