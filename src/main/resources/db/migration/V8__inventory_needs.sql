-- Backlog v1.x item 3: Potrzeby/Zamówienia (InventoryNeed + status flow).
-- Rows are evidence (B9 unfreeze of the BRAK action from the stocktake report);
-- at most one non-terminal need per item, enforced by the partial unique index.
CREATE TABLE IF NOT EXISTS inventory_needs (
    id BIGSERIAL PRIMARY KEY,
    band_id BIGINT NOT NULL,
    item_id BIGINT NOT NULL REFERENCES inventory_items (id),
    name VARCHAR(200) NOT NULL,
    serial_number VARCHAR(120),
    quantity INT NOT NULL DEFAULT 1 CHECK (quantity >= 1),
    status VARCHAR(16) NOT NULL CHECK (status IN ('OPEN', 'ORDERED', 'RECEIVED', 'CANCELLED')),
    note TEXT,
    resolution_note TEXT,
    created_member_id BIGINT,
    created_member_name VARCHAR(200),
    created_at TIMESTAMP NOT NULL,
    resolved_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_needs_band ON inventory_needs (band_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_needs_open
    ON inventory_needs (item_id)
    WHERE status IN ('OPEN', 'ORDERED');
