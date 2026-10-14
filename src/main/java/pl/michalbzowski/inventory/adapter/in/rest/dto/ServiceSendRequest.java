package pl.michalbzowski.inventory.adapter.in.rest.dto;

import jakarta.validation.constraints.Size;

/** POST /items/{id}/service — why the item goes to service (F4; note is optional). */
public record ServiceSendRequest(
        @Size(max = 2000, message = "notatka jest za długa") String note) {
}
