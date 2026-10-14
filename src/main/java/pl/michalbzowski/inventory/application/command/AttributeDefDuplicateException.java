package pl.michalbzowski.inventory.application.command;

/**
 * An active definition with the same (band, item type, name-ignore-case)
 * already exists. Rendered as HTTP 409 (mirrors the WM
 * {@code DuplicateAttributeException} convention).
 */
public class AttributeDefDuplicateException extends RuntimeException {

    public AttributeDefDuplicateException(String name) {
        super("Atrybut \"" + name + "\" już istnieje dla tego typu pozycji w tym bandzie");
    }
}
