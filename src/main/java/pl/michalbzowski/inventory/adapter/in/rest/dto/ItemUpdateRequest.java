package pl.michalbzowski.inventory.adapter.in.rest.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import pl.michalbzowski.inventory.application.command.ItemWriteCommand;
import pl.michalbzowski.inventory.domain.inventory.WarehouseType;

/**
 * PUT body of an inventory item. No {@code type} field: the type is immutable
 * in v1 because attribute definitions are per type (see analysis 3.1). No
 * {@code serialNumber} either — the code is program-assigned at creation
 * (ItemSerialAllocator) and no longer an edit surface.
 */
public record ItemUpdateRequest(
        @NotBlank(message = "name jest wymagane") @Size(max = 255) String name,
        WarehouseType warehouse,
        String description,
        String notes,
        List<AttributeValueDto> attributes) {

    public ItemWriteCommand.Basics toCommand() {
        return new ItemWriteCommand.Basics(name, warehouse, description, notes,
                attributes == null ? List.of() : attributes.stream().map(AttributeValueDto::toCommand).toList());
    }
}
