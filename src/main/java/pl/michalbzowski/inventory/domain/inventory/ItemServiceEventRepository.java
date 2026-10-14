package pl.michalbzowski.inventory.domain.inventory;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Service-workflow history (F4). The open event per item is unique at DB level
 * (partial index completed_at IS NULL); the lookups mirror that contract.
 */
public interface ItemServiceEventRepository extends JpaRepository<ItemServiceEvent, Long> {

    Optional<ItemServiceEvent> findByItemIdAndCompletedAtIsNull(Long itemId);

    List<ItemServiceEvent> findByItemIdOrderBySentAtDescIdDesc(Long itemId);

    /** Existence gate for item deletion: history is evidence, items WITH history are not deletable. */
    boolean existsByItemId(Long itemId);
}
