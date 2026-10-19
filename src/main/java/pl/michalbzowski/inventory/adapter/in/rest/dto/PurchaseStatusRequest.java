package pl.michalbzowski.inventory.adapter.in.rest.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import pl.michalbzowski.inventory.domain.inventory.PurchaseStatus;

/**
 * Status transition for a purchase. Only SENT/IN_PROGRESS/DELIVERED/
 * READY_FOR_PICKUP/RECEIVED/CANCELLED are addressable — REQUESTED exists
 * solely as the freshly-created state (the domain rejects rewinding).
 */
public record PurchaseStatusRequest(
        @NotNull(message = "status jest wymagany") PurchaseStatus status,
        @Size(max = 2000, message = "notatka jest za długa") String note) {
}
