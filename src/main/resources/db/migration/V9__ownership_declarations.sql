-- Backlog v1.x item 4 (B14): Declarations of private/external possession.
-- Evidence rows: name/serial snapshotted at declaration time; warehouse and
-- lifecycle status are NOT touched. One ACTIVE row per item (partial unique),
-- REVOKED rows stay as history.
CREATE TABLE IF NOT EXISTS ownership_declarations (
    id BIGSERIAL PRIMARY KEY,
    band_id BIGINT NOT NULL,
    item_id BIGINT NOT NULL REFERENCES inventory_items (id),
    name VARCHAR(200) NOT NULL,
    serial_number VARCHAR(120),
    type VARCHAR(16) NOT NULL CHECK (type IN ('PRIVATE', 'EXTERNAL')),
    status VARCHAR(16) NOT NULL CHECK (status IN ('ACTIVE', 'REVOKED')),
    holder_member_id BIGINT,
    holder_name VARCHAR(200),
    location_text VARCHAR(200),
    note TEXT,
    declared_by_member_id BIGINT,
    declared_by_member_name VARCHAR(200),
    created_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,
    revoked_by VARCHAR(200),
    revoked_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_ownership_declarations_band
    ON ownership_declarations (band_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ownership_declarations_active
    ON ownership_declarations (item_id)
    WHERE status = 'ACTIVE';
