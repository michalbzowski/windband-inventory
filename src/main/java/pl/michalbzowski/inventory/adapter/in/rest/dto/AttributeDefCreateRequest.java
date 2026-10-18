package pl.michalbzowski.inventory.adapter.in.rest.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import pl.michalbzowski.inventory.application.command.AttributeDefCreateCommand;
import pl.michalbzowski.inventory.domain.inventory.AttributeDataType;
import pl.michalbzowski.inventory.domain.inventory.ItemType;

/** POST body of an attribute definition. */
public record AttributeDefCreateRequest(
        @NotBlank(message = "name jest wymagane") @Size(max = 255) String name,
        @NotNull(message = "itemType jest wymagane") ItemType itemType,
        @NotNull(message = "dataType jest wymagane") AttributeDataType dataType,
        Integer displayOrder,
        Boolean required,
        Boolean displayInList,
        List<String> options,
        Long dependsOnDefId,
        List<String> dependsOnValues) {

    public AttributeDefCreateCommand toCommand() {
        return new AttributeDefCreateCommand(name, itemType, dataType,
                displayOrder != null ? displayOrder : 0,
                Boolean.TRUE.equals(required), Boolean.TRUE.equals(displayInList),
                options,
                // sentinel 0 = "bez zależności" tak samo jak brak pola (spójnie z PUT)
                dependsOnDefId != null && dependsOnDefId > 0 ? dependsOnDefId : null,
                dependsOnValues);
    }
}
