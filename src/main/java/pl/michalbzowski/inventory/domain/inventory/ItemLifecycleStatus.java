package pl.michalbzowski.inventory.domain.inventory;

/**
 * Lifecycle status of an inventory item (frozen by decision B6).
 * ASSIGNED is driven by the assignment/return module; IN_SERVICE by the
 * service workflow (v1.x) — the vocabulary itself is fixed now because the
 * stocktake snapshot (F5) reads AVAILABLE and ASSIGNED states.
 */
public enum ItemLifecycleStatus {
    /** Dostępny w magazynie. */
    AVAILABLE,
    /** Przypisany do członka zespołu. */
    ASSIGNED,
    /** W serwisie (v1.x workflow). */
    IN_SERVICE,
    /** Wycofany z użytku. */
    RETIRED,
    /** Zutylizowany. */
    DISPOSED,
    /** Zagubiony. */
    LOST
}
