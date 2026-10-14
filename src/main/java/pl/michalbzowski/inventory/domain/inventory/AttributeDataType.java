package pl.michalbzowski.inventory.domain.inventory;

/**
 * Value type of a dynamic attribute definition (frozen list from the v1
 * analysis, section 3.1). Conditionally-rendered rules (v2 feature) are
 * deliberately not modelled here.
 */
public enum AttributeDataType {
    /** Liczba (także dziesiętna). */
    NUMBER,
    /** Pojedynczy wybór z listy opcji. */
    SELECT,
    /** Wielokrotny wybór z listy opcji. */
    MULTI,
    /** Tak / nie. */
    BOOLEAN,
    /** Data (ISO yyyy-MM-dd). */
    DATE,
    /** Dowolny tekst. */
    TEXT
}
