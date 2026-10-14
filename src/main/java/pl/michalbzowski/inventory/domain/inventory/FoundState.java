package pl.michalbzowski.inventory.domain.inventory;

/**
 * What a counter saw on one unit (spec F5.1). OK/MISSING/BROKEN are the three
 * big mobile buttons; EXTRA is reserved for units ADDED to the stocktake that
 * were not in the expected snapshot (Nadwyżka, B9) — a snapshot line can
 * never be re-labelled EXTRA.
 */
public enum FoundState {
    OK,
    BROKEN,
    MISSING,
    EXTRA
}
