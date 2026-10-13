package pl.michalbzowski.inventory.adapter.in.rest.dto;

import jakarta.validation.constraints.Size;
import java.util.List;
import pl.michalbzowski.inventory.application.command.AttributeDefUpdateCommand;

/** PUT body of an attribute definition (type/dataType immutable). */
public record AttributeDefUpdateRequest(
        @Size(max = 255) String name,
        Integer displayOrder,
        Boolean required,
        Boolean displayInList,
        List<String> options) {

    public AttributeDefUpdateCommand toCommand() {
        return new AttributeDefUpdateCommand(name, displayOrder, required, displayInList, options);
    }
}
