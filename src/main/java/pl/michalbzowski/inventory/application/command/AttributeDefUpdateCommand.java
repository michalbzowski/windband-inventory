package pl.michalbzowski.inventory.application.command;

import java.util.List;

/**
 * Update payload of an attribute definition. The item type and data type are
 * immutable once created (existing values depend on them — v1 rule).
 */
public record AttributeDefUpdateCommand(
        String name,
        Integer displayOrder,
        Boolean required,
        Boolean displayInList,
        List<String> options) {
}
