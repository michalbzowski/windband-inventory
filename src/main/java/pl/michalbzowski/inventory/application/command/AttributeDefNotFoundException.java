package pl.michalbzowski.inventory.application.command;

/** Unknown attribute-definition id. */
public class AttributeDefNotFoundException extends RuntimeException {

    public AttributeDefNotFoundException(long id) {
        super("Definicja atrybutu o id " + id + " nie istnieje");
    }
}
