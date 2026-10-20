package pl.michalbzowski.inventory.application.command;

import java.util.List;
import pl.michalbzowski.inventory.domain.inventory.ItemType;
import pl.michalbzowski.inventory.domain.inventory.WarehouseType;

/** Full create-payload of an item (attributes validated against active defs of band+type). */
public record ItemWriteCommand(
        String name,
        ItemType type,
        WarehouseType warehouse,
        /** Optional explicit code (legacy/interop); blank → program-assigned via ItemSerialAllocator. */
        String serialNumber,
        String description,
        String notes,
        List<AttributeValueCommand> attributes) {

    /**
     * Update variant: type is immutable in v1 (per-type attribute defs) and the
     * serial code is program-assigned at creation — neither is an edit surface.
     */
    public record Basics(
            String name,
            WarehouseType warehouse,
            String description,
            String notes,
            List<AttributeValueCommand> attributes) {
    }
}
