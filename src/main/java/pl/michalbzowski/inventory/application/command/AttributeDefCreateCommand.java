package pl.michalbzowski.inventory.application.command;

import java.util.List;
import pl.michalbzowski.inventory.domain.inventory.AttributeDataType;
import pl.michalbzowski.inventory.domain.inventory.ItemType;

/** Create payload of an attribute definition (band + item type scope). */
public record AttributeDefCreateCommand(
        String name,
        ItemType itemType,
        AttributeDataType dataType,
        Integer displayOrder,
        boolean required,
        boolean displayInList,
        List<String> options,
        Long dependsOnDefId,
        List<String> dependsOnValues) {
}
