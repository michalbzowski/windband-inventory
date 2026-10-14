package pl.michalbzowski.inventory.adapter.in.rest.dto;

import jakarta.validation.constraints.NotNull;
import pl.michalbzowski.inventory.application.command.AttributeValueCommand;

/** Submitted (definition, value) pair. */
public record AttributeValueDto(
        @NotNull(message = "attributeDefId jest wymagane") Long attributeDefId,
        String value) {

    public AttributeValueCommand toCommand() {
        return new AttributeValueCommand(attributeDefId, value);
    }
}
