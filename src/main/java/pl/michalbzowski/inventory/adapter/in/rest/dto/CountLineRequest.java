package pl.michalbzowski.inventory.adapter.in.rest.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import pl.michalbzowski.inventory.domain.inventory.FoundState;

/**
 * One counted unit. {@code countedMemberId} is the ACTIVE roster member the
 * client counts as — re-validated against the live WM roster (B10; there is
 * deliberately no member↔user mapping to infer it from the token).
 * EXTRA is rejected by the domain here — use the extra-line endpoint.
 */
public record CountLineRequest(
        @NotNull(message = "foundState jest wymagane") FoundState foundState,
        @Size(max = 2000) String note,
        @NotNull(message = "countedMemberId jest wymagane") Long countedMemberId) {
}
