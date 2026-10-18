package pl.michalbzowski.inventory.application.command;

import java.util.List;

/**
 * Update payload of an attribute definition. The item type and data type are
 * immutable once created (existing values depend on them — v1 rule).
 * {@code active} (nullable) reactivates or deactivates the definition.
 * Dependency (v2.0 rules): {@code dependsOnDefId} null = leave as-is,
 * 0 or less = remove dependency, &gt; 0 = set parent (with
 * {@code dependsOnValues}); values alone (without parent id) replace the
 * condition values on the existing parent.
 */
public record AttributeDefUpdateCommand(
        String name,
        Integer displayOrder,
        Boolean required,
        Boolean displayInList,
        List<String> options,
        Boolean active,
        Long dependsOnDefId,
        List<String> dependsOnValues) {
}
