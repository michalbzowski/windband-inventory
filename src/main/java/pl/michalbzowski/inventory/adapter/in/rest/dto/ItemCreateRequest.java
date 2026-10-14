package pl.michalbzowski.inventory.adapter.in.rest.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import pl.michalbzowski.inventory.application.command.ItemWriteCommand;
import pl.michalbzowski.inventory.domain.inventory.ItemType;
import pl.michalbzowski.inventory.domain.inventory.WarehouseType;

/** POST body of an inventory item. */
public record ItemCreateRequest(
        @NotBlank(message = "name jest wymagane") @Size(max = 255) String name,
        @NotNull(message = "type jest wymagane") ItemType type,
        WarehouseType warehouse,
        @Size(max = 255) String serialNumber,
        String description,
        String notes,
        List<AttributeValueDto> attributes) {

    public ItemWriteCommand toCommand() {
        return new ItemWriteCommand(name, type, warehouse, serialNumber, description, notes,
                attributes == null ? List.of() : attributes.stream().map(AttributeValueDto::toCommand).toList());
    }
}
