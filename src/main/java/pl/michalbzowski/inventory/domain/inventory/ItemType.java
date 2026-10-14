package pl.michalbzowski.inventory.domain.inventory;

/**
 * Unified inventory type (decision D1). One concrete item model; per-type
 * specifics live in dynamic {@link ItemAttributeDef}s, never in Java
 * subclasses. The set is frozen by the inherited decisions D1–D4.
 */
public enum ItemType {
    /** Umundurowanie i elementy stroju. */
    UNIFORM,
    /** Instrumenty muzyczne. */
    INSTRUMENT,
    /** Odznaki i nagrody. */
    AWARD,
    /** Nuty i materiały nutowe. */
    SHEET_MUSIC,
    /** Sprzęt (stojaki, stroiki, nagłośnienie itd.). */
    EQUIPMENT,
    /** Środki eksploatacyjne (stroiki, oleje itd.). */
    CONSUMABLE,
    /** Dokumenty. */
    DOCUMENT,
    /** Pozostałe. */
    OTHER
}
