package pl.michalbzowski.inventory.application.command;

/** A referenced need does not exist in this deployment (404, same family as item/stocktake). */
public class NeedNotFoundException extends RuntimeException {

    public NeedNotFoundException(long id) {
        super("Potrzeba o id " + id + " nie istnieje");
    }
}
