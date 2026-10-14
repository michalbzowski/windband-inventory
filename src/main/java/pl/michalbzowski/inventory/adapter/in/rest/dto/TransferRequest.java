package pl.michalbzowski.inventory.adapter.in.rest.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import pl.michalbzowski.inventory.domain.inventory.WarehouseType;

/** POST /items/{id}/transfers — target warehouse + optional note (decision B6). */
public record TransferRequest(
        @NotNull(message = "magazyn docelowy (to) jest wymagany") WarehouseType to,
        @Size(max = 2000, message = "notatka jest za długa") String note) {
}
