package pl.michalbzowski.inventory.application.command;

/** 404 surface for declaration ids (mirrors NeedNotFoundException). */
public class DeclarationNotFoundException extends RuntimeException {

    public DeclarationNotFoundException(long id) {
        super("Deklaracja " + id + " nie istnieje");
    }
}
