package pl.michalbzowski.inventory.application.command;

/**
 * One snapshotted attribute value of a purchase order: the definition id that was
 * valid when the order was placed, its name (evidence copy — defs may later be
 * renamed or deactivated) and the normalized value. Serialized as JSON into
 * {@code purchase_requests.attribute_snapshot}; on DELIVERED the pairs are re-validated
 * against the live defs and attached to the freshly created item.
 */
public record AttributeEntry(long attributeDefId, String name, String value) {
}
