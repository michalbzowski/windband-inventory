package pl.michalbzowski.inventory.adapter.in.rest.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Nadwyżka: a physical unit of this band that was not in the snapshot. */
public record ExtraLineRequest(
        @NotNull(message = "itemId jest wymagane") Long itemId,
        @Size(max = 2000) String note,
        @NotNull(message = "countedMemberId jest wymagane") Long countedMemberId) {
}
