package pl.michalbzowski.inventory.domain.inventory;

/**
 * Lifecycle of a purchase request for a NEW item (roadmap 2026-10-19).
 * Happy path: REQUESTED → SENT → IN_PROGRESS → DELIVERED → READY_FOR_PICKUP → RECEIVED.
 * CANCELLED is reachable before DELIVERED only — once goods exist physically,
 * the item register owns them (delete/unassign), not the purchase.
 */
public enum PurchaseStatus {
    REQUESTED,
    SENT,
    IN_PROGRESS,
    DELIVERED,
    READY_FOR_PICKUP,
    RECEIVED,
    CANCELLED,
}
