package pl.michalbzowski.inventory.domain.inventory;

/**
 * Service-job (repair request) lifecycle, decision B15.
 * Happy path: REQUESTED → SHIPPED → REPAIRED → READY_FOR_PICKUP → IN_STOCK →
 * HANDLED_OVER. CANCELLED is reachable from REQUESTED ONLY — once the item has
 * physically left the band, its return is managed by physical steps (IN_STOCK +
 * HANDLED_OVER), not by cancellation. HANDLED_OVER and CANCELLED are terminal.
 */
public enum ServiceJobStatus {
    /** Zgłoszone — zgłoszono naprawę; pozycja bez zmian. */
    REQUESTED,
    /** Wysłane do serwisu — przydział zdjęty (jeśli był), pozycja IN_SERVICE / SERVICE. */
    SHIPPED,
    /** Naprawione — informacyjnie u naprawcy; pozycja nadal poza bandem. */
    REPAIRED,
    /** Do odbioru z serwisu — gotowe do podjęcia. */
    READY_FOR_PICKUP,
    /** W magazynie — fizycznie wróciło: AVAILABLE / MAIN. */
    IN_STOCK,
    /** Przekazano osobie zgłaszającej — przydział przywrócony; terminalne. */
    HANDLED_OVER,
    /** Anulowane — tylko z REQUESTED; terminalne. */
    CANCELLED
}
