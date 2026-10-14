package pl.michalbzowski.inventory.application.query;

import java.time.LocalDateTime;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.michalbzowski.inventory.application.command.NeedNotFoundException;
import pl.michalbzowski.inventory.domain.inventory.InventoryNeed;
import pl.michalbzowski.inventory.domain.inventory.InventoryNeedRepository;
import pl.michalbzowski.inventory.domain.inventory.NeedStatus;

/** Read side for the needs screen/report actions (any band member, B8). */
@Service
@Transactional(readOnly = true)
public class NeedQueryService {

    private final InventoryNeedRepository needs;

    public NeedQueryService(InventoryNeedRepository needs) {
        this.needs = needs;
    }

    public List<NeedView> list(long bandId, NeedStatus status) {
        return status == null
                ? needs.findByBandIdOrderByCreatedAtDescIdDesc(bandId).stream().map(NeedView::of).toList()
                : needs.findByBandIdAndStatusOrderByCreatedAtDescIdDesc(bandId, status).stream()
                        .map(NeedView::of).toList();
    }

    public NeedView detail(long id) {
        return NeedView.of(load(id));
    }

    /** Authz needs the band before the view exists — same pattern as stocktakes. */
    public long bandOf(long needId) {
        return load(needId).getBandId();
    }

    private InventoryNeed load(long id) {
        return needs.findById(id).orElseThrow(() -> new NeedNotFoundException(id));
    }

    /** Frozen snapshot fields (name/serial) come from the need row, not the item (evidence). */
    public record NeedView(long id, long bandId, long itemId, String name, String serialNumber,
            int quantity, NeedStatus status, String note, String resolutionNote,
            Long createdMemberId, String createdMemberName,
            LocalDateTime createdAt, LocalDateTime resolvedAt) {

        public static NeedView of(InventoryNeed need) {
            return new NeedView(need.getId(), need.getBandId(), need.getItem().getId(), need.getName(),
                    need.getSerialNumber(), need.getQuantity(), need.getStatus(), need.getNote(),
                    need.getResolutionNote(), need.getCreatedMemberId(), need.getCreatedMemberName(),
                    need.getCreatedAt(), need.getResolvedAt());
        }
    }
}
