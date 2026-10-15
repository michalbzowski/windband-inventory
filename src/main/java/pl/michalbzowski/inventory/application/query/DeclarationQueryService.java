package pl.michalbzowski.inventory.application.query;

import java.time.LocalDateTime;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.michalbzowski.inventory.application.command.DeclarationNotFoundException;
import pl.michalbzowski.inventory.domain.inventory.DeclarationStatus;
import pl.michalbzowski.inventory.domain.inventory.DeclarationType;
import pl.michalbzowski.inventory.domain.inventory.OwnershipDeclaration;
import pl.michalbzowski.inventory.domain.inventory.OwnershipDeclarationRepository;

/** Read side for possession declarations (any band member; B14). */
@Service
@Transactional(readOnly = true)
public class DeclarationQueryService {

    private final OwnershipDeclarationRepository declarations;

    public DeclarationQueryService(OwnershipDeclarationRepository declarations) {
        this.declarations = declarations;
    }

    public List<DeclarationView> list(long bandId, DeclarationType type, DeclarationStatus status,
            Long holderMemberId) {
        if (holderMemberId != null) {
            return declarations.findByBandIdAndHolderMemberIdOrderByCreatedAtDescIdDesc(bandId, holderMemberId)
                    .stream().map(DeclarationView::of).toList();
        }
        List<OwnershipDeclaration> rows;
        if (type != null && status != null) {
            rows = declarations.findByBandIdAndTypeAndStatusOrderByCreatedAtDescIdDesc(bandId, type, status);
        } else if (type != null) {
            rows = declarations.findByBandIdAndTypeOrderByCreatedAtDescIdDesc(bandId, type);
        } else if (status != null) {
            rows = declarations.findByBandIdAndStatusOrderByCreatedAtDescIdDesc(bandId, status);
        } else {
            rows = declarations.findByBandIdOrderByCreatedAtDescIdDesc(bandId);
        }
        return rows.stream().map(DeclarationView::of).toList();
    }

    public DeclarationView detail(long id) {
        return DeclarationView.of(load(id));
    }

    /** Authz needs the band before the view exists — same pattern as needs/stocktakes. */
    public long bandOf(long declarationId) {
        return load(declarationId).getBandId();
    }

    private OwnershipDeclaration load(long id) {
        return declarations.findById(id).orElseThrow(() -> new DeclarationNotFoundException(id));
    }

    /** Frozen snapshot fields (name/serial) come from the row, not the item — evidence. */
    public record DeclarationView(long id, long bandId, long itemId, String name, String serialNumber,
            DeclarationType type, DeclarationStatus status,
            Long holderMemberId, String holderName, String locationText, String note,
            Long declaredByMemberId, String declaredByName, LocalDateTime createdAt,
            LocalDateTime revokedAt, String revokedBy, String revokedNote) {

        public static DeclarationView of(OwnershipDeclaration d) {
            return new DeclarationView(d.getId(), d.getBandId(), d.getItem().getId(), d.getName(),
                    d.getSerialNumber(), d.getType(), d.getStatus(),
                    d.getHolderMemberId(), d.getHolderName(), d.getLocationText(), d.getNote(),
                    d.getDeclaredByMemberId(), d.getDeclaredByMemberName(), d.getCreatedAt(),
                    d.getRevokedAt(), d.getRevokedBy(), d.getRevokedNote());
        }
    }
}
