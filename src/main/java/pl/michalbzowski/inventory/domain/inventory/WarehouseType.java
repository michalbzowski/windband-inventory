package pl.michalbzowski.inventory.domain.inventory;

/**
 * Physical locations of stock (decision B6). v1 keeps exactly these three
 * fixed locations; {@code WarehouseTransfer} history arrives with the
 * warehouse slice of the base module.
 */
public enum WarehouseType {
    /** Magazyn główny. */
    MAIN,
    /** Pokój serwisowy / naprawy. */
    SERVICE,
    /** Archiwum. */
    ARCHIVE
}
