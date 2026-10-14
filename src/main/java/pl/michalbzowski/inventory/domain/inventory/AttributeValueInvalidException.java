package pl.michalbzowski.inventory.domain.inventory;

/**
 * Thrown when a submitted attribute value violates the definition's data type,
 * option set or required flag. Rendered as HTTP 400 by the REST layer.
 */
public class AttributeValueInvalidException extends RuntimeException {

    public AttributeValueInvalidException(String message) {
        super(message);
    }
}
