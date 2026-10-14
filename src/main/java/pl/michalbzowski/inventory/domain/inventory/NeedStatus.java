package pl.michalbzowski.inventory.domain.inventory;

/**
 * Status flow of a need (backlog v1.x item 3): zgłoszono → zamówiono →
 * dostarczono; anulować można do momentu dostarczenia. RECEIVED and
 * CANCELLED are terminal — rows are evidence and are never rewritten.
 */
public enum NeedStatus {
    /** Zgłoszona (np. akcją „→ Potrzeba” z raportu spisu, B9). */
    OPEN,
    /** Zamówiona — zamówienie uruchomione. */
    ORDERED,
    /** Dostarczona / zrealizowana — koniec ścieżki. */
    RECEIVED,
    /** Anulowana — nie dotyczy / zaniechane. */
    CANCELLED
}
