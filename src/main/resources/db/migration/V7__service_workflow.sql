-- F4 service workflow (analysis §4 v1.x item 2): sendToService → IN_SERVICE →
-- completeService + nextServiceDate; "do serwisu" list.
-- Evidence rows mirror item_assignments (V4): while completed_at IS NULL the
-- event is the ONE open service record of the item (partial unique index).

ALTER TABLE inventory_items
    ADD COLUMN IF NOT EXISTS next_service_date DATE;

CREATE TABLE IF NOT EXISTS item_service_events (
    id BIGSERIAL PRIMARY KEY,
    band_id BIGINT NOT NULL,
    item_id BIGINT NOT NULL REFERENCES inventory_items (id) ON DELETE CASCADE,
    sent_at TIMESTAMP NOT NULL,
    sent_note TEXT,
    completed_at TIMESTAMP,
    completed_note TEXT,
    next_service_date DATE
);

CREATE INDEX IF NOT EXISTS idx_item_service_events_band
    ON item_service_events (band_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_item_service_events_open
    ON item_service_events (item_id)
    WHERE completed_at IS NULL;

-- "do serwisu" scans: band + due date of available items
CREATE INDEX IF NOT EXISTS idx_items_band_next_service
    ON inventory_items (band_id, next_service_date);
