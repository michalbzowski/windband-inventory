package pl.michalbzowski.inventory.domain.inventory;

/**
 * Stocktake lifecycle (spec F5/B7): start is IN_PROGRESS right away; DRAFT is
 * the PAUSED state (offline counting halts, queue flushes are rejected until
 * RESUME); CLOSED freezes every line.
 */
public enum StocktakeStatus {
    /** Spauzowany — oczekuje na wznowienie. */
    DRAFT,
    /** Trwa liczenie. */
    IN_PROGRESS,
    /** Zamknięty, raport zamrożony. */
    CLOSED
}
