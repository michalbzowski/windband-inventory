package pl.michalbzowski.inventory.adapter.in.rest.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Service (repair) report for an EXISTING item, decision B15. The reporter is
 * the member the repair concerns — re-validated against the live WM roster
 * (B10) and snapshotted onto the evidence row; null is allowed (band-level
 * repair) but then HANDLED_OVER is impossible on this row.
 */
public record ServiceJobCreateRequest(
        @NotNull(message = "itemId jest wymagane") Long itemId,
        @Size(max = 2000, message = "notatka jest za długa") String note,
        Long reporterMemberId,
        @NotNull(message = "createdMemberId jest wymagane") Long createdMemberId) {
}
