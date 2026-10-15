package pl.michalbzowski.inventory.domain.inventory;

/** Lifecycle of a declaration row (decision B14): ACTIVE → REVOKED, never back. */
public enum DeclarationStatus {
    ACTIVE,
    REVOKED
}
