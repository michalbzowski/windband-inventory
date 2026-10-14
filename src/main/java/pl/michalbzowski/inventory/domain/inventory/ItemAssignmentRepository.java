package pl.michalbzowski.inventory.domain.inventory;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Assignment-history repository. The active assignment per item is unique at
 * DB level (partial index); the lookups here mirror that contract.
 */
public interface ItemAssignmentRepository extends JpaRepository<ItemAssignment, Long> {

    Optional<ItemAssignment> findByItemIdAndReturnedAtIsNull(Long itemId);

    List<ItemAssignment> findByItemIdOrderByAssignedAtDescIdDesc(Long itemId);

    List<ItemAssignment> findByBandIdAndMemberIdOrderByAssignedAtDesc(Long bandId, Long memberId);
}
