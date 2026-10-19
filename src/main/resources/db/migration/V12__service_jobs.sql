-- B15 (2026-10-19): planja zgloszen napraw istniejacych pozycji.
-- Maszyna stanow: REQUESTED -> SHIPPED -> REPAIRED -> READY_FOR_PICKUP ->
-- IN_STOCK -> HANDLED_OVER; CANCELLED wyklacznie z REQUESTED (po wyslaniu
-- instrumentu powrot idzie scinka fizyczna: IN_STOCK + HANDLED_OVER).
-- Efekty na pozycji (przydzial / stan / magazyn) egzekwowane w
-- ServiceJobCommandService w jednej transakcji — szczegoly w decyzji B15.
CREATE TABLE IF NOT EXISTS service_jobs (
    id BIGSERIAL PRIMARY KEY,
    band_id BIGINT NOT NULL,
    item_id BIGINT NOT NULL REFERENCES inventory_items (id) ON DELETE CASCADE,
    reporter_member_id BIGINT,
    reporter_member_name VARCHAR(200),
    status VARCHAR(32) NOT NULL CHECK (status IN
        ('REQUESTED', 'SHIPPED', 'REPAIRED', 'READY_FOR_PICKUP', 'IN_STOCK', 'HANDLED_OVER', 'CANCELLED')),
    note TEXT,
    resolution_note TEXT,
    created_by_member_id BIGINT,
    created_by_member_name VARCHAR(200),
    created_at TIMESTAMP NOT NULL,
    shipped_at TIMESTAMP,
    returned_at TIMESTAMP,
    handed_over_at TIMESTAMP,
    cancelled_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_service_jobs_band ON service_jobs (band_id, status);

CREATE INDEX IF NOT EXISTS idx_service_jobs_item ON service_jobs (item_id, id DESC);

-- Do jednego niezamknietego zloszenia naprawy na pozycje (jak uq_inventory_needs_open).
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_jobs_open
    ON service_jobs (item_id)
    WHERE status IN ('REQUESTED', 'SHIPPED', 'REPAIRED', 'READY_FOR_PICKUP', 'IN_STOCK');
