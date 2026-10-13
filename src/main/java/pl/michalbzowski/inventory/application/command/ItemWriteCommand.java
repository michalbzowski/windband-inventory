package pl.michalbzowski.inventory.application.command;

import java.util.List;
import pl.michalbzowski.inventory.domain.inventory.ItemType;
import pl.michalbzowski.inventory.domain.inventory.WarehouseType;

/** Full create-payload of an item (attributes validated against active defs of band+type). */
public record ItemWriteCommand(
        String name,
        ItemType type,
        WarehouseType warehouse,
        String serialNumber,
        String description,
        String notes,
        List<AttributeValueCommand> attributes) {

    /** Update variant: the type is immutable in v1 (attribute defs are per type). */
    public record Basics(
            String name,
            WarehouseType warehouse,
            String serialNumber,
            String description,
            String notes,
            List<AttributeValueCommand> attributes) {
    }
}
