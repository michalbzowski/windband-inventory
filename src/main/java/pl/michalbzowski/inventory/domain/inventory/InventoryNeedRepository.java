package pl.michalbzowski.inventory.domain.inventory;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Needs/orders (backlog v1.x item 3). Open-per-item uniqueness is enforced at
 * DB level (partial index on status IN (OPEN, ORDERED)); the existence
 * lookup mirrors that contract so duplicates surface as a friendly 409.
 */
public interface InventoryNeedRepository extends JpaRepository<InventoryNeed, Long> {

    List<InventoryNeed> findByBandIdOrderByCreatedAtDescIdDesc(Long bandId);

    List<InventoryNeed> findByBandIdAndStatusOrderByCreatedAtDescIdDesc(Long bandId, NeedStatus status);

    boolean existsByItemIdAndStatusIn(Long itemId, List<NeedStatus> statuses);

    /** Existence gate for item deletion: an unresolved need is evidence too. */
    boolean existsByItemId(Long itemId);
}
