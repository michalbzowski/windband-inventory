package pl.michalbzowski.inventory.domain.inventory;

/** What kind of off-warehouse possession a declaration records (decision B14). */
public enum DeclarationType {
    /** The item is kept privately, at a named member's place. */
    PRIVATE,
    /** The item sits in a location outside the band's warehouses. */
    EXTERNAL
}
