package pl.michalbzowski.inventory.adapter.in.rest.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** POST /items/{id}/assign — WM member id + optional note (stored in history). */
public record AssignRequest(
        @NotNull(message = "memberId jest wymagany") Long memberId,
        @Size(max = 2000, message = "notatka jest za długa") String note) {
}
