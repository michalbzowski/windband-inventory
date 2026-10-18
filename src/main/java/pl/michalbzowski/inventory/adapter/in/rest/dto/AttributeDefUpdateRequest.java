package pl.michalbzowski.inventory.adapter.in.rest.dto;

import jakarta.validation.constraints.Size;
import java.util.List;
import pl.michalbzowski.inventory.application.command.AttributeDefUpdateCommand;

/** PUT body of an attribute definition (type/dataType immutable).
 * `active` toggles activation (null = leave as-is) — reactivation of a
 * softly-deleted def is the counterpart of DELETE-as-deactivation. */
public record AttributeDefUpdateRequest(
        @Size(max = 255) String name,
        Integer displayOrder,
        Boolean required,
        Boolean displayInList,
        List<String> options,
        Boolean active,
        Long dependsOnDefId,
        List<String> dependsOnValues) {

    public AttributeDefUpdateCommand toCommand() {
        return new AttributeDefUpdateCommand(name, displayOrder, required, displayInList, options, active,
                dependsOnDefId, dependsOnValues);
    }
}
