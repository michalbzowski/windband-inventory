package pl.michalbzowski.inventory.application.command;

import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.michalbzowski.inventory.application.port.BandDirectory;
import pl.michalbzowski.inventory.application.port.BandMember;
import pl.michalbzowski.inventory.domain.inventory.InventoryItem;
import pl.michalbzowski.inventory.domain.inventory.InventoryItemRepository;
import pl.michalbzowski.inventory.domain.inventory.InventoryNeed;
import pl.michalbzowski.inventory.domain.inventory.InventoryNeedRepository;
import pl.michalbzowski.inventory.domain.inventory.NeedStatus;

/**
 * Needs/orders (backlog v1.x item 3): record what the band is missing (the
 * unfrozen BRAK action from the stocktake report, B9) and walk the
 * OPEN → ORDERED → RECEIVED / CANCELLED flow. Writes are ADMIN-only at the
 * controller (B8); here the INVARIANTS live: same-band item, one open need
 * per item, active roster creator (B10 re-validation, mirrors counting).
 */
@Service
public class NeedCommandService {

    private final InventoryNeedRepository needs;
    private final InventoryItemRepository items;
    private final BandDirectory bandDirectory;

    public NeedCommandService(InventoryNeedRepository needs, InventoryItemRepository items,
            BandDirectory bandDirectory) {
        this.needs = needs;
        this.items = items;
        this.bandDirectory = bandDirectory;
    }

    @Transactional
    public InventoryNeed create(String bearerToken, long bandId, long itemId, int quantity,
            String note, Long createdMemberId) {
        InventoryItem item = items.findById(itemId).orElseThrow(() -> new ItemNotFoundException(itemId));
        if (item.getBandId() != bandId) {
            throw new IllegalArgumentException("Potrzeba musi dotyczyć pozycji tego samego bandu");
        }
        if (needs.existsByItemIdAndStatusIn(itemId, List.of(NeedStatus.OPEN, NeedStatus.ORDERED))) {
            throw new IllegalStateException("Ta pozycja ma już niezamkniętą potrzebę — najpierw ją rozstrzygnij");
        }
        BandMember creator = requireActiveMember(bearerToken, bandId, createdMemberId);
        return needs.save(InventoryNeed.request(item, quantity, note, creator.memberId(), creator.fullName()));
    }

    /** Evidence-friendly: terminal transitions throw (IllegalStateException → 409). */
    @Transactional
    public InventoryNeed changeStatus(long needId, NeedStatus target, String note) {
        InventoryNeed need = needs.findById(needId).orElseThrow(() -> new NeedNotFoundException(needId));
        switch (target) {
            case ORDERED -> need.order(note);
            case RECEIVED -> need.receive(note);
            case CANCELLED -> need.cancel(note);
            default -> throw new IllegalArgumentException("OPEN ustawia się sam przy tworzeniu — nie ma cofnięcia do OPEN");
        }
        return need;
    }

    private BandMember requireActiveMember(String bearerToken, long bandId, Long createdMemberId) {
        if (createdMemberId == null) {
            throw new IllegalArgumentException("Podaj createdMemberId — potrzebuje zgłasza konkretny członek");
        }
        BandMember member = bandDirectory.members(bearerToken, bandId).stream()
                .filter(m -> m.memberId() == createdMemberId)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "Członek o id " + createdMemberId + " nie należy do tego bandu"));
        if (!member.active()) {
            throw new IllegalArgumentException(
                    "Zgłaszać może tylko aktywny członek bandu — " + member.fullName() + " jest nieaktywny");
        }
        return member;
    }
}
