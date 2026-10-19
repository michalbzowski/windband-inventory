package pl.michalbzowski.inventory.application.query;

import java.time.LocalDateTime;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.michalbzowski.inventory.application.command.PurchaseNotFoundException;
import pl.michalbzowski.inventory.domain.inventory.PurchaseRequest;
import pl.michalbzowski.inventory.domain.inventory.PurchaseRequestRepository;
import pl.michalbzowski.inventory.domain.inventory.PurchaseStatus;

/** Read side for the purchases board (any band member; writes are ADMIN at the controller). */
@Service
@Transactional(readOnly = true)
public class PurchaseQueryService {

    private final PurchaseRequestRepository purchases;

    public PurchaseQueryService(PurchaseRequestRepository purchases) {
        this.purchases = purchases;
    }

    public List<PurchaseView> list(long bandId, PurchaseStatus status) {
        return status == null
                ? purchases.findByBandIdOrderByCreatedAtDescIdDesc(bandId).stream().map(PurchaseView::of).toList()
                : purchases.findByBandIdAndStatusOrderByCreatedAtDescIdDesc(bandId, status).stream()
                        .map(PurchaseView::of).toList();
    }

    public PurchaseView detail(long id) {
        return PurchaseView.of(load(id));
    }

    /** Authz needs the band before the view exists — same pattern as needs. */
    public long bandOf(long purchaseId) {
        return load(purchaseId).getBandId();
    }

    private PurchaseRequest load(long id) {
        return purchases.findById(id).orElseThrow(() -> new PurchaseNotFoundException(id));
    }

    /** Snapshot fields (names) come from the purchase row, not the member/item APIs (evidence). */
    public record PurchaseView(long id, long bandId, String name, String itemType, PurchaseStatus status,
            long requestedForMemberId, String requestedForName, String note, String resolutionNote,
            Long createdMemberId, String createdMemberName,
            Long itemId, String itemSerialNumber,
            LocalDateTime createdAt, LocalDateTime deliveredAt, LocalDateTime receivedAt) {

        public static PurchaseView of(PurchaseRequest purchase) {
            var item = purchase.getItem();
            return new PurchaseView(purchase.getId(), purchase.getBandId(), purchase.getName(),
                    purchase.getItemType().name(), purchase.getStatus(),
                    purchase.getRequestedForMemberId(), purchase.getRequestedForName(),
                    purchase.getNote(), purchase.getResolutionNote(),
                    purchase.getCreatedMemberId(), purchase.getCreatedMemberName(),
                    item == null ? null : item.getId(), item == null ? null : item.getSerialNumber(),
                    purchase.getCreatedAt(), purchase.getDeliveredAt(), purchase.getReceivedAt());
        }
    }
}
