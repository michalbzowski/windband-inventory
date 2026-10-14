package pl.michalbzowski.inventory.adapter.in.rest.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * New need request (backlog v1.x item 3). {@code createdMemberId} is the
 * roster member the client reports as — re-validated against the live WM
 * roster (B10), exactly like the counting screen sends countedMemberId.
 */
public record NeedCreateRequest(
        @NotNull(message = "itemId jest wymagane") Long itemId,
        @NotNull(message = "quantity jest wymagane") @Min(value = 1, message = "ilość musi wynosić co najmniej 1")
        @Max(value = 999, message = "ilość jest za duża") Integer quantity,
        @Size(max = 2000, message = "notatka jest za długa") String note,
        @NotNull(message = "createdMemberId jest wymagane") Long createdMemberId) {
}
