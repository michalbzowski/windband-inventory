package pl.michalbzowski.inventory.adapter.in.rest.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import pl.michalbzowski.inventory.domain.inventory.ItemType;

/**
 * New purchase request (roadmap 2026-10-19): a brand-new item bought for a
 * named member. Both member ids are re-validated against the live WM roster
 * (B10) — names are snapshotted onto the evidence row.
 */
public record PurchaseCreateRequest(
        @NotNull(message = "name jest wymagane") @Size(max = 200, message = "nazwa jest za długa") String name,
        @NotNull(message = "itemType jest wymagane") ItemType itemType,
        @NotNull(message = "requestedForMemberId jest wymagane") Long requestedForMemberId,
        @Size(max = 2000, message = "notatka jest za długa") String note,
        @NotNull(message = "createdMemberId jest wymagane") Long createdMemberId) {
}
