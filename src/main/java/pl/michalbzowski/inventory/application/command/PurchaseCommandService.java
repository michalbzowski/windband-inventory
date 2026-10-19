package pl.michalbzowski.inventory.application.command;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;
import pl.michalbzowski.inventory.domain.inventory.InventoryItem;
import pl.michalbzowski.inventory.domain.inventory.InventoryItemRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemAssignment;
import pl.michalbzowski.inventory.domain.inventory.ItemAssignmentRepository;
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
 */
@Service
@RequiredArgsConstructor
public class PurchaseCommandService {

    private final PurchaseRequestRepository purchases;
    private final InventoryItemRepository items;
    private final ItemAssignmentRepository assignments;
    private final BandDirectory bandDirectory;

    @Transactional
    public PurchaseRequest create(String bearerToken, long bandId, String name,
            pl.michalbzowski.inventory.domain.inventory.ItemType itemType, long requestedForMemberId,
            String note, long createdMemberId) {
        BandMember forWhom = requireActiveMember(bearerToken, bandId, requestedForMemberId,
                "Zamówienie musi wskazywać aktywnego członka (dla kogo kupujemy)");
        BandMember creator = requireActiveMember(bearerToken, bandId, createdMemberId,
                "Podaj createdMemberId — zamówienie zgłasza konkretny członek");
        return purchases.save(PurchaseRequest.request(bandId, name, itemType,
                forWhom.memberId(), forWhom.fullName(), note, creator.memberId(), creator.fullName()));
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
