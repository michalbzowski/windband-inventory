package pl.michalbzowski.inventory.application.command;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;
import java.util.List;
import pl.michalbzowski.inventory.domain.inventory.InventoryItem;
import pl.michalbzowski.inventory.domain.inventory.InventoryItemRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemAssignment;
import pl.michalbzowski.inventory.domain.inventory.ItemAssignmentRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemAttributeValue;
import pl.michalbzowski.inventory.domain.inventory.PurchaseRequest;
import pl.michalbzowski.inventory.domain.inventory.PurchaseRequestRepository;
import pl.michalbzowski.inventory.domain.inventory.PurchaseStatus;
import pl.michalbzowski.inventory.domain.inventory.WarehouseType;
import pl.michalbzowski.inventory.application.port.BandDirectory;
import pl.michalbzowski.inventory.application.port.BandMember;

/**
 * Purchase flow (roadmap 2026-10-19): REQUESTED → SENT → IN_PROGRESS →
 * DELIVERED → READY_FOR_PICKUP → RECEIVED (+ CANCELLED before delivery).
 * Writes are ADMIN-only at the controller (B8); the physical side effects
 * live here: DELIVERED creates the warehouse item (MAIN, AVAILABLE,
 * unassigned), RECEIVED assigns it to the member and opens the assignment
 * history row — the same invariants the manual assign path enforces.
 *
 * <p>Attribute values are accepted at creation with the SAME validation as the
 * new-item form (shared {@link AttributeScopeValidator}), snapshotted onto the
 * evidence row, and re-validated + attached when DELIVERED materialises the item.
 */
@Service
@RequiredArgsConstructor
public class PurchaseCommandService {

    private final PurchaseRequestRepository purchases;
    private final InventoryItemRepository items;
    private final ItemAssignmentRepository assignments;
    private final BandDirectory bandDirectory;
    private final AttributeScopeValidator scopeValidator;

    @Transactional
    public PurchaseRequest create(String bearerToken, long bandId, String name,
            pl.michalbzowski.inventory.domain.inventory.ItemType itemType, long requestedForMemberId,
            String note, long createdMemberId, List<AttributeValueCommand> attributes) {
        BandMember forWhom = requireActiveMember(bearerToken, bandId, requestedForMemberId,
                "Zamówienie musi wskazywać aktywnego członka (dla kogo kupujemy)");
        BandMember creator = requireActiveMember(bearerToken, bandId, createdMemberId,
                "Podaj createdMemberId — zamówienie zgłasza konkretny członek");
        // Same rules as the new-item form: required/conditional/format; hidden
        // branches are dropped silently. The accepted pairs become the snapshot.
        List<AttributeEntry> snapshot = scopeValidator
                .resolve(bandId, itemType, attributes)
                .stream()
                .map(r -> new AttributeEntry(r.defId(), r.def().getName(), r.value()))
                .toList();
        return purchases.save(PurchaseRequest.request(bandId, name, itemType,
                forWhom.memberId(), forWhom.fullName(), note, creator.memberId(), creator.fullName(),
                AttributeSnapshotCodec.toJson(snapshot)));
    }

    /**
     * Walks the flow. Only forward transitions exist; the freshly created item is
     * linked on DELIVERED and assigned on RECEIVED (re-validated against the live
     * WM roster at that moment — B10 — so an ex-member cannot receive goods).
     */
    @Transactional
    public PurchaseRequest changeStatus(String bearerToken, long purchaseId, PurchaseStatus target, String note) {
        if (target == null) {
            throw new IllegalArgumentException("status jest wymagany");
        }
        PurchaseRequest purchase = purchases.findById(purchaseId)
                .orElseThrow(() -> new PurchaseNotFoundException(purchaseId));
        switch (target) {
            case SENT -> purchase.sendToExecution();
            case IN_PROGRESS -> purchase.startExecution();
            case DELIVERED -> {
                InventoryItem item = InventoryItem.create(purchase.getBandId(), purchase.getName(),
                        purchase.getItemType(), WarehouseType.MAIN, null, null,
                        "Utworzone z zamówienia #" + purchase.getId());
                attachSnapshotAttributes(purchase, item);
                items.save(item);
                purchase.deliver(item, note);
            }
            case READY_FOR_PICKUP -> purchase.readyForPickup(note);
            case RECEIVED -> {
                InventoryItem item = purchase.getItem();
                if (item == null) {
                    throw new IllegalStateException("Dostarczenie musi wcześnie założyć pozycję — zamówienie nie ma związku");
                }
                BandMember member = requireActiveMember(bearerToken, purchase.getBandId(),
                        purchase.getRequestedForMemberId(),
                        "Odebrać może tylko aktywny członek — zmień go lub przywróć, potem potwierdź odbiór");
                item.assignTo(member.memberId(), member.fullName());
                assignments.save(ItemAssignment.open(item, member.memberId(), member.fullName(),
                        "Odbiór zamówienia #" + purchase.getId()));
                purchase.receive(note);
            }
            case CANCELLED -> purchase.cancel(note);
            default -> throw new IllegalArgumentException(
                    "REQUESTED ustawia się sam przy tworzeniu — nie ma cofnięcia do tego stanu");
        }
        return purchase;
    }

    /**
     * Links the captured attribute snapshot to the freshly created item. Re-validation
     * against the LIVE defs keeps the same semantics as editing an item: hidden
     * conditional branches are dropped silently, a missing required value rejects the
     * delivery (the purchase stays IN_PROGRESS until the defs are fixed).
     */
    private void attachSnapshotAttributes(PurchaseRequest purchase, InventoryItem item) {
        List<AttributeEntry> snapshot = AttributeSnapshotCodec.parse(purchase.getAttributeSnapshot());
        if (snapshot.isEmpty()) {
            return;
        }
        item.replaceAttributes(scopeValidator
                .resolve(item.getBandId(), item.getType(), AttributeSnapshotCodec.toCommands(snapshot))
                .stream()
                .map(r -> new ItemAttributeValue(item, r.def(), r.value()))
                .toList());
    }

    private BandMember requireActiveMember(String bearerToken, long bandId, Long memberId, String missingMessage) {
        if (memberId == null) {
            throw new IllegalArgumentException(missingMessage);
        }
        BandMember member = bandDirectory.members(bearerToken, bandId).stream()
                .filter(m -> m.memberId() == memberId)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "Członek o id " + memberId + " nie należy do tego bandu"));
        if (!member.active()) {
            throw new IllegalArgumentException(missingMessage + " — " + member.fullName() + " jest nieaktywny");
        }
        return member;
    }
}
