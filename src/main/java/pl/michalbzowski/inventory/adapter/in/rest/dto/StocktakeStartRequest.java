package pl.michalbzowski.inventory.adapter.in.rest.dto;

import jakarta.validation.constraints.Size;
import pl.michalbzowski.inventory.domain.inventory.ItemLifecycleStatus;
import pl.michalbzowski.inventory.domain.inventory.ItemType;
import pl.michalbzowski.inventory.domain.inventory.WarehouseType;

/**
 * Start filters (F5.3: "start: filtry typ/status/magazyn") + free-text notes.
 * All optional — an empty body snapshots every AVAILABLE/ASSIGNED item.
 */
public record StocktakeStartRequest(
        ItemType type,
        ItemLifecycleStatus status,
        WarehouseType warehouse,
        @Size(max = 2000) String notes) {
}
