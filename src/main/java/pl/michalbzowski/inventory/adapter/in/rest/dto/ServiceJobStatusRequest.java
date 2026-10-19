package pl.michalbzowski.inventory.adapter.in.rest.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import pl.michalbzowski.inventory.domain.inventory.ServiceJobStatus;

/**
 * Status transition for a service job. Addressable targets: SHIPPED, REPAIRED,
 * READY_FOR_PICKUP, IN_STOCK, HANDLED_OVER, CANCELLED — REQUESTED exists solely
 * as the freshly-created state (the domain rejects rewinding to it).
 */
public record ServiceJobStatusRequest(
        @NotNull(message = "status jest wymagany") ServiceJobStatus status,
        @Size(max = 2000, message = "notatka jest za długa") String note) {
}
