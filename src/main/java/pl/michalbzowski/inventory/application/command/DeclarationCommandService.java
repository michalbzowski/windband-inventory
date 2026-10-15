package pl.michalbzowski.inventory.application.command;

import pl.michalbzowski.inventory.application.port.BandDirectory;
import pl.michalbzowski.inventory.application.port.BandMember;
import pl.michalbzowski.inventory.domain.inventory.DeclarationStatus;
import pl.michalbzowski.inventory.domain.inventory.DeclarationType;
import pl.michalbzowski.inventory.domain.inventory.InventoryItem;
import pl.michalbzowski.inventory.domain.inventory.InventoryItemRepository;
import pl.michalbzowski.inventory.domain.inventory.OwnershipDeclaration;
import pl.michalbzowski.inventory.domain.inventory.OwnershipDeclarationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Declarations of private/external possession (backlog v1.x item 4, decision B14).
 * INVARIANTS live here: same-band item, one ACTIVE per item (409), ASSIGNED items
 * are not declarable (409 — the entity enforces it), holder and declarator are
 * re-validated against the live WM roster on every write (B10, mirrors counting).
 * Creates are allowed for any active member; revokes are ADMIN at the controller (B8).
 */
@Service
public class DeclarationCommandService {

    private final OwnershipDeclarationRepository declarations;
    private final InventoryItemRepository items;
    private final BandDirectory bandDirectory;

    public DeclarationCommandService(OwnershipDeclarationRepository declarations,
            InventoryItemRepository items, BandDirectory bandDirectory) {
        this.declarations = declarations;
        this.items = items;
        this.bandDirectory = bandDirectory;
    }

    @Transactional
    public OwnershipDeclaration create(String bearerToken, long bandId, long itemId, DeclarationType type,
            Long holderMemberId, String locationText, String note, Long declaredByMemberId) {
        InventoryItem item = items.findById(itemId).orElseThrow(() -> new ItemNotFoundException(itemId));
        if (item.getBandId() != bandId) {
            throw new IllegalArgumentException("Deklaracja musi dotyczyć pozycji tego samego bandu");
        }
        if (declarations.existsByItemIdAndStatus(itemId, DeclarationStatus.ACTIVE)) {
            throw new IllegalStateException("Pozycja ma już aktywną deklarację posiadania — odwołaj ją najpierw");
        }
        BandMember declarator = requireActiveMember(bearerToken, bandId, declaredByMemberId,
                "Podaj declaredByMemberId — deklarację składa konkretny członek");
        BandMember holder = holderMemberId == null
                ? null
                : requireActiveMember(bearerToken, bandId, holderMemberId, "Deklaracja wymaga osoby z rosteru");
        if (type == DeclarationType.PRIVATE && holder == null) {
            throw new IllegalArgumentException("Deklaracja prywatna wymaga osoby (holderMemberId)");
        }
        return declarations.save(OwnershipDeclaration.declare(item, type,
                holder == null ? null : holder.memberId(),
                holder == null ? null : holder.fullName(),
                locationText, note,
                declarator.memberId(), declarator.fullName()));
    }

    /** ADMIN only (controller guard); revokedBy stays null — the actor is the ADMIN of the guard. */
    @Transactional
    public OwnershipDeclaration revoke(long declarationId, String note) {
        OwnershipDeclaration declaration = declarations.findById(declarationId)
                .orElseThrow(() -> new DeclarationNotFoundException(declarationId));
        declaration.revoke(note, null);
        return declaration;
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
            throw new IllegalArgumentException(
                    "Deklarację składa osoba aktywna — " + member.fullName() + " jest nieaktywny");
        }
        return member;
    }
}
