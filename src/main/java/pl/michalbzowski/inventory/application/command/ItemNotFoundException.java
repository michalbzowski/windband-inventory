package pl.michalbzowski.inventory.application.command;

/** Unknown item id (never leaks existence across bands: cross-band is 403 first). */
public class ItemNotFoundException extends RuntimeException {

    public ItemNotFoundException(long id) {
        super("Pozycja inwentarza o id " + id + " nie istnieje");
    }
}
