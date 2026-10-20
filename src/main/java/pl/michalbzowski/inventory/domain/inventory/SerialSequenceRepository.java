package pl.michalbzowski.inventory.domain.inventory;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Counters behind auto-assigned item codes. At most ONE row per (band, type) —
 * enforced by the uq_serial_seq_band_type unique index (V15); concurrent first
 * writes race on a DataIntegrityViolationException which the allocator retries.
 */
public interface SerialSequenceRepository extends JpaRepository<SerialSequence, Long> {

    Optional<SerialSequence> findByBandIdAndItemType(Long bandId, String itemType);
}
