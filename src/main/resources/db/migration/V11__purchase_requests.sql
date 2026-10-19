-- Zamówienia nowych przedmiotów (roadmapa 2026-10-19): pełnościeżkowy zakup
-- od zgłoszenia po wydanie osobie. Wiersz jest dowodem — nazwy snapshotowane.
-- Dostarczenie tworzy pozycję w inventory_items (id w item_id), odbiór ją przypisuje.
CREATE TABLE IF NOT EXISTS purchase_requests (
    id BIGSERIAL PRIMARY KEY,
    band_id BIGINT NOT NULL,
    name VARCHAR(200) NOT NULL,
    item_type VARCHAR(20) NOT NULL CHECK (item_type IN
        ('UNIFORM', 'INSTRUMENT', 'AWARD', 'SHEET_MUSIC', 'EQUIPMENT', 'CONSUMABLE', 'DOCUMENT')),
    status VARCHAR(20) NOT NULL CHECK (status IN
        ('REQUESTED', 'SENT', 'IN_PROGRESS', 'DELIVERED', 'READY_FOR_PICKUP', 'RECEIVED', 'CANCELLED')),
    requested_for_member_id BIGINT NOT NULL,
    requested_for_name VARCHAR(200) NOT NULL,
    note TEXT,
    resolution_note TEXT,
    created_member_id BIGINT,
    created_member_name VARCHAR(200),
    item_id BIGINT REFERENCES inventory_items (id),
    created_at TIMESTAMP NOT NULL,
    delivered_at TIMESTAMP,
    received_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_purchase_requests_band ON purchase_requests (band_id, status);
