package pl.michalbzowski.inventory.application.command;

/** Requested (item, attribute-definition) value pair. */
public record AttributeValueCommand(Long attributeDefId, String value) {
}
