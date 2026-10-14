package pl.michalbzowski.inventory.domain.inventory;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Transfer-history repository (append-only). Item history is the only v1
 * read path; band-wide movement reports belong to the v1.x backlog.
 */
public interface WarehouseTransferRepository extends JpaRepository<WarehouseTransfer, Long> {

    List<WarehouseTransfer> findByItemIdOrderByTransferredAtDescIdDesc(Long itemId);

    /** Existence gate for item deletion: history is evidence, items WITH history are not deletable. */
    boolean existsByItemId(Long itemId);
}
