package pl.michalbzowski.inventory.domain.inventory;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** Purchase requests (roadmap 2026-10-19). Uniqueness: none — many purchases per member allowed. */
public interface PurchaseRequestRepository extends JpaRepository<PurchaseRequest, Long> {

    List<PurchaseRequest> findByBandIdOrderByCreatedAtDescIdDesc(Long bandId);

    List<PurchaseRequest> findByBandIdAndStatusOrderByCreatedAtDescIdDesc(Long bandId, PurchaseStatus status);

    /** Existence gate: a delivered purchase's item is referenced even after receipt. */
    boolean existsByItemId(Long itemId);
}
