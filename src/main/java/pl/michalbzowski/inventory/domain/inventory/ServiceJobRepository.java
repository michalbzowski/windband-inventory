package pl.michalbzowski.inventory.domain.inventory;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Repairs of existing items (B15). At most ONE open repair per position — the
 * DB enforces it via uq_service_jobs_open and ServiceJobCommandService checks
 * it before insert so the error is a clean domain message.
 */
public interface ServiceJobRepository extends JpaRepository<ServiceJob, Long> {

    List<ServiceJob> findByBandIdOrderByCreatedAtDescIdDesc(Long bandId);

    List<ServiceJob> findByBandIdAndStatusOrderByCreatedAtDescIdDesc(Long bandId, ServiceJobStatus status);

    /** Open (non-terminal) repairs on the item — B15: at most one. */
    long countByItemIdAndStatusNotIn(Long itemId, List<ServiceJobStatus> closed);

    /** Existence gate: ItemCommandService.delete refuses while repairs reference the item. */
    boolean existsByItemId(Long itemId);
}
