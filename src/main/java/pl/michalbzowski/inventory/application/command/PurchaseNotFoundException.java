package pl.michalbzowski.inventory.application.command;

/** A referenced purchase does not exist in this deployment (404, same family as need/item). */
public class PurchaseNotFoundException extends RuntimeException {

    public PurchaseNotFoundException(long id) {
        super("Zamówienie o id " + id + " nie istnieje");
    }
}
