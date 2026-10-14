package pl.michalbzowski.inventory.adapter.in.rest.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import pl.michalbzowski.inventory.domain.inventory.NeedStatus;

/**
 * Status transition for a need. Only ORDERED/RECEIVED/CANCELLED are
 * addressable — OPEN exists solely as the freshly-created state (the domain
 * rejects rewinding evidence).
 */
public record NeedStatusRequest(
        @NotNull(message = "status jest wymagany") NeedStatus status,
        @Size(max = 2000, message = "notatka jest za długa") String note) {
}
