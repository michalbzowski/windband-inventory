package pl.michalbzowski.inventory.adapter.in.rest.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import pl.michalbzowski.inventory.application.command.AttributeValueCommand;
import pl.michalbzowski.inventory.domain.inventory.ItemType;

/**
 * New purchase request (roadmap 2026-10-19): a brand-new item bought for a
 * named member. Both member ids are re-validated against the live WM roster
 * (B10) — names are snapshotted onto the evidence row.
 *
 * <p>{@code attributes} uses the SAME shape as item creation
 * ({@link AttributeValueCommand}): def id + value, validated against the active
 * definitions of band+itemType by the shared AttributeScopeValidator and stored
 * as a snapshot; hidden conditional branches are dropped silently, exactly like
 * in the new-item form.
 */
public record PurchaseCreateRequest(
        @Size(max = 200, message = "nazwa jest za długa") String name,
        @NotNull(message = "itemType jest wymagane") ItemType itemType,
        @NotNull(message = "requestedForMemberId jest wymagane") Long requestedForMemberId,
        @Size(max = 2000, message = "notatka jest za długa") String note,
        @NotNull(message = "createdMemberId jest wymagane") Long createdMemberId,
        @Size(max = 50, message = "za dużo atrybutów") List<AttributeValueCommand> attributes) {
}
