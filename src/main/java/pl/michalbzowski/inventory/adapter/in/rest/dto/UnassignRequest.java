package pl.michalbzowski.inventory.adapter.in.rest.dto;

import jakarta.validation.constraints.Size;
import pl.michalbzowski.inventory.domain.inventory.ItemLifecycleStatus;

/**
 * POST /items/{id}/unassign — {@code state} is the condition the item comes
 * back in (null = AVAILABLE; the domain rejects nonsensical targets), plus an
 * optional note.
 */
public record UnassignRequest(
        ItemLifecycleStatus state,
        @Size(max = 2000, message = "notatka jest za długa") String note) {
}
